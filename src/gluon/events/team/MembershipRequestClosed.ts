import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import {addressSlackUsersFromContext} from "@atomist/automation-client/spi/message/MessageClient";
import {addressSlackChannelsFromContext} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage} from "@atomist/slack-messages";
import {isSuccessCode} from "../../../http/Http";
import {GluonService} from "../../services/gluon/GluonService";
import {
    handleQMError,
    QMError,
    ResponderMessageClient,
} from "../../util/shared/Error";

@CommandHandler("Close a membership request")
export class MembershipRequestClosed implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public approverUserName: string;

    @MappedParameter(MappedParameters.SlackTeam)
    public slackTeam: string;

    @MappedParameter(MappedParameters.SlackChannel)
    public slackChannelId: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "Gluon team id",
    })
    public teamId: string;

    @Parameter({
        description: "Name of the team",
    })
    public teamName: string;

    @Parameter({
        description: "Membership request id",
    })
    public membershipRequestId: string;

    @Parameter({
        description: "Slack name of applying user",
    })
    public userScreenName: string;

    @Parameter({
        description: "Slack id of applying user",
    })
    public userSlackId: string;

    @Parameter({
        description: "Status of request approval",
    })
    public approvalStatus: string;

    @Parameter({
        required: true,
        description: "correlation id of the message that invoked this command",
    })
    public correlationId: string;

    constructor(private gluonService = new GluonService()) {
    }

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Attempting approval from user: ${this.approverUserName}`);

        try {

            const actioningMember = await this.findGluonTeamMember(this.approverUserName);

            await this.updateGluonMembershipRequest(
                this.teamId,
                this.membershipRequestId,
                actioningMember.memberId,
                this.approvalStatus,
            );

            return await this.handleMembershipRequestResult(ctx);
        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    private async findGluonTeamMember(slackScreenName: string) {
        try {
            return await this.gluonService.members.gluonMemberFromScreenName(slackScreenName, false);
        } catch (error) {
            logger.error("The approver is not a gluon member. This can only happen if the user was deleted before approving this request.");
            throw new QMError("You are no longer a Subatomic user. Membership request closure failed.");
        }
    }

    private async updateGluonMembershipRequest(teamId: string, membershipRequestId: string, approvedByMemberId: string, approvalStatus: string) {
        const updateMembershipRequestResult = await this.gluonService.members.updateGluonMembershipRequest(teamId,
            {
                membershipRequests: [
                    {
                        membershipRequestId,
                        approvedBy: {
                            memberId: approvedByMemberId,
                        },
                        requestStatus: approvalStatus,
                    }],
            });

        if (!isSuccessCode(updateMembershipRequestResult.status)) {
            logger.error("Failed to update the membership request.");
            throw new QMError(`The membership request could not be updated. Please ensure that you are an owner of this team before responding to the membership request.`);
        }
    }

    private async handleMembershipRequestResult(ctx: HandlerContext) {
        if (this.approvalStatus === "APPROVED") {
            await this.editRequestMessage(ctx, "APPROVED", "#45B254");
        } else {
            await this.editRequestMessage(ctx, "REJECTED", "#D94649");
            return await this.handleRejectedMembershipRequest(ctx, this.teamName, this.approverUserName, this.userScreenName);
        }
    }

    private async handleRejectedMembershipRequest(ctx: HandlerContext, teamName: string, rejectingUserScreenName: string, rejectedUserScreenName: string) {
        const destination =  await addressSlackUsersFromContext(ctx, rejectedUserScreenName);
        return await ctx.messageClient.send(`Your membership request to team '${teamName}' has been rejected by @${rejectingUserScreenName}`,
            destination);
    }

    private async handleError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }

    private async editRequestMessage(ctx: HandlerContext, status: string, color: string) {
        const msg: SlackMessage = {
            text: `User @${this.userScreenName} has requested to be added as a team member.`,
            attachments: [{
                fallback: `User @${this.userScreenName} has requested to be added as a team member`,
                color: `${color}`,
                text: `${status}`,
                mrkdwn_in: ["text"],
            }],
        };
        const destination =  await addressSlackChannelsFromContext(ctx, this.teamChannel);

        return await ctx.messageClient.send(msg, destination, {id: this.correlationId});
    }
}
