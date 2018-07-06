import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    success,
    Tags,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import axios from "axios";
import {QMConfig} from "../../../config/QMConfig";
import {handleQMError, QMError, ResponderMessageClient} from "../../util/shared/Error";
import {isSuccessCode} from "../../util/shared/Http";
import {OnboardMember} from "../member/Onboard";

@CommandHandler("Create a new team", QMConfig.subatomic.commandPrefix + " create team")
@Tags("subatomic", "team")
export class CreateTeam implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @Parameter({
        description: "team name",
    })
    private name: string;

    @Parameter({
        description: "team description",
    })
    private description: string;

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Creating team for member: ${this.screenName}`);

        try {
            const memberQueryResult = await this.getGluonMemberFromScreenName(this.screenName);

            if (!isSuccessCode(memberQueryResult.status)) {
                logger.info(`Slackname ${this.screenName} is not associated with a gluon identity`);
                return await this.requestMemberOnboarding(ctx, this.name);
            }

            const member = memberQueryResult.data._embedded.teamMemberResources[0];

            await this.createTeamInGluon(this.name, this.description, member.memberId);

            return await success();
        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    private async getGluonMemberFromScreenName(screenName: string) {
        return await axios.get(`${QMConfig.subatomic.gluon.baseUrl}/members?slackScreenName=${screenName}`);
    }

    private async createTeamInGluon(teamName: string, teamDescription: string, createdBy: string) {
        const teamCreationResult = await await axios.post(`${QMConfig.subatomic.gluon.baseUrl}/teams`, {
            name: teamName,
            description: teamDescription,
            createdBy,
        });

        if (!isSuccessCode(teamCreationResult.status)) {
            logger.error(`Failed to create the team with name ${name}. Error: ${teamCreationResult.status}`);
            throw new QMError("Unable to create team.");
        }
    }

    private async requestMemberOnboarding(ctx: HandlerContext, teamName: string) {
        const msg: SlackMessage = {
            text: `There was an error creating your ${teamName} team`,
            attachments: [{
                text: `
Unfortunately you do not seem to have been onboarded to Subatomic.
To create a team you must first onboard yourself. Click the button below to do that now.
                            `,
                fallback: "You are not onboarded to Subatomic",
                footer: `For more information, please read the ${this.docs()}`,
                color: "#D94649",
                mrkdwn_in: ["text"],
                thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
                actions: [
                    buttonForCommand(
                        {
                            text: "Onboard me",
                        },
                        new OnboardMember()),
                ],
            }],
        };

        return await ctx.messageClient.respond(msg);
    }

    private async handleError(ctx: HandlerContext, error) {
        return await handleQMError(new ResponderMessageClient(ctx), error);
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#onboard-me`,
            "documentation")}`;
    }
}
