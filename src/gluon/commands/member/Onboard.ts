import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    Tags,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import {QMConfig} from "../../../config/QMConfig";
import {MemberService} from "../../util/member/Members";
import {
    handleQMError,
    QMError,
    ResponderMessageClient,
} from "../../util/shared/Error";
import {isSuccessCode} from "../../util/shared/Http";
import {CreateTeam} from "../team/CreateTeam";
import {JoinTeam} from "../team/JoinTeam";

@CommandHandler("Onboard a new team member", QMConfig.subatomic.commandPrefix + " onboard me")
@Tags("subatomic", "slack", "member")
export class OnboardMember implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackUser)
    public userId: string;

    @Parameter({
        displayName: "first name",
        description: "your first name",
    })
    public firstName: string;

    @Parameter({
        description: "your last name",
    })
    public lastName: string;

    @Parameter({
        description: "your email address",
        pattern: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
    })
    public email: string;

    @Parameter({
        description: "your username including domain",
        validInput: "Domain username in the following format: domain\\username",
    })
    public domainUsername: string;

    constructor(private memberService = new MemberService()) {
    }

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            logger.info("Creating");
            await this.createGluonTeamMember(
                {
                    firstName: this.firstName,
                    lastName: this.lastName,
                    email: this.email,
                    domainUsername: this.domainUsername,
                    slack: {
                        screenName: this.screenName,
                        userId: this.userId,
                    },
                });

            return await this.presentTeamCreationAndApplicationOptions(ctx, this.firstName, this.userId);
        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    private async createGluonTeamMember(teamMemberDetails: any) {

        const createMemberResult = await this.memberService.createGluonMember(teamMemberDetails);

        if (!isSuccessCode(createMemberResult.status)) {
            throw new QMError(`Unable to onboard a member with provided details. Details of the user are already in use.`);
        }
    }

    private async presentTeamCreationAndApplicationOptions(ctx: HandlerContext, firstName: string, userId: string): Promise<HandlerResult> {
        const text: string = `
Welcome to the Subatomic environment *${firstName}*!
Next steps are to either join an existing team or create a new one.
                `;

        const msg: SlackMessage = {
            text,
            attachments: [{
                fallback: "Welcome to the Subatomic environment",
                footer: `For more information, please read the ${this.docs()}`,
                thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
                actions: [
                    buttonForCommand(
                        {
                            text: "Apply to join a team",
                            style: "primary",
                        },
                        new JoinTeam()),
                    buttonForCommand(
                        {text: "Create a new team"},
                        new CreateTeam()),
                ],
            }],
        };
        return await ctx.messageClient.addressUsers(msg, userId);
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#joinTeam`,
            "documentation")}`;
    }

    private async handleError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }
}
