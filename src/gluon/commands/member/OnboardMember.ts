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
import {QMConfig} from "../../../config/QMConfig";
import {OnboardMemberMessages} from "../../messages/member/OnboardMemberMessages";
import {GluonService} from "../../services/gluon/GluonService";
import {
    handleQMError,
    QMError,
    ResponderMessageClient,
} from "../../util/shared/Error";
import {isSuccessCode} from "../../util/shared/Http";

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

    public onboardMessages: OnboardMemberMessages = new OnboardMemberMessages();

    constructor(private gluonService = new GluonService()) {
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
            const message = this.onboardMessages.presentTeamCreationAndApplicationOptions(this.firstName);
            return await ctx.messageClient.addressUsers(message, this.userId);
        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    private async createGluonTeamMember(teamMemberDetails: any) {

        const createMemberResult = await this.gluonService.members.createGluonMember(teamMemberDetails);

        if (createMemberResult.status === 409) {
            logger.error(`Failed to onboard a member since the details of the user are already in use.`);
            throw new QMError(`Failed to onboard since the member's details are already in use. Please retry using different values.`);
        } else if (!isSuccessCode(createMemberResult.status)) {
            throw new QMError(`Unable to onboard a member with provided details. Details of the user are already in use.`);
        }
    }

    private async handleError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }
}
