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
import {isSuccessCode} from "../../../http/Http";
import {GluonService} from "../../services/gluon/GluonService";
import {getScreenName, loadScreenNameByUserId} from "../../util/member/Members";
import {handleQMError, QMError, ResponderMessageClient} from "../../util/shared/Error";

@CommandHandler("Request membership to a team")
@Tags("subatomic", "team", "member")
export class CreateMembershipRequestToTeam implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @Parameter({
        description: "Gluon team id to create a membership request to.",
        displayable: false,

    })
    public teamId: string;

    @Parameter({
        description: "Slack name of the member to add.",
    })
    public slackName: string;

    constructor(private gluonService = new GluonService()) {
    }

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Request to join team: ${this.teamId}`);
        try {

            const screenName = getScreenName(this.slackName);

            const chatId = await loadScreenNameByUserId(ctx, screenName);

            const memberDetails = await this.gluonService.members.gluonMemberFromScreenName(chatId);

            await this.createMembershipRequest(memberDetails);

            return await ctx.messageClient.respond("Your request to join then team has been sent.");
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    private async createMembershipRequest(newMember) {
        const updateTeamResult = await this.gluonService.teams.createMembershipRequest(this.teamId,
            {
                membershipRequests: [
                    {
                        requestedBy: {
                            memberId: newMember.memberId,
                        },
                    }],
            });

        if (!isSuccessCode(updateTeamResult.status)) {
            throw new QMError(`❗Failed to add member to the team. Server side failure.`);
        }
    }
}
