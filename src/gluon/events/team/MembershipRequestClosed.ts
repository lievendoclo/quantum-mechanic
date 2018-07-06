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
import {addressSlackUsers} from "@atomist/automation-client/spi/message/MessageClient";
import {inviteUserToSlackChannel} from "@atomist/lifecycle-automation/handlers/command/slack/AssociateRepo";
import {SlackMessage} from "@atomist/slack-messages";
import axios from "axios";
import {QMConfig} from "../../../config/QMConfig";
import {handleQMError, QMError, ResponderMessageClient} from "../../util/shared/Error";
import {isSuccessCode} from "../../util/shared/Http";

@CommandHandler("Close a membership request")
@Tags("subatomic", "team", "membership")
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
        const approverMemberQueryResult = await axios.get(`${QMConfig.subatomic.gluon.baseUrl}/members?slackScreenName=${slackScreenName}`);

        if (!isSuccessCode(approverMemberQueryResult.status)) {
            logger.error("The approver is not a gluon member. This can only happen if the user was deleted before approving this request.");
            throw new QMError("You are no longer a Subatomic user. Membership request closure failed.");
        }

        return approverMemberQueryResult.data._embedded.teamMemberResources[0];
    }

    private async updateGluonMembershipRequest(teamId: string, membershipRequestId: string, approvedByMemberId: string, approvalStatus: string) {
        const updateMembershipRequestResult = await axios.put(
            `${QMConfig.subatomic.gluon.baseUrl}/teams/${teamId}`,
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
            logger.error("Failed to update the member shiprequest.");
            throw new QMError(`The membership request could not be updated. Please ensure that you are an owner of this team before responding to the membership request.`);
        }
    }

    private async handleMembershipRequestResult(ctx: HandlerContext) {
        if (this.approvalStatus === "APPROVED") {
            return await this.handleApprovedMembershipRequest(ctx, this.slackChannelId, this.userScreenName, this.slackTeam, this.approverUserName, this.teamChannel);
        } else {
            return await this.handleRejectedMembershipRequest(ctx, this.teamName, this.approverUserName, this.userScreenName, this.teamChannel);
        }
    }

    private async handleApprovedMembershipRequest(ctx: HandlerContext, slackChannelId: string, approvedUserScreenName: string, slackTeam: string, approvingUserSlackId: string, slackTeamChannel: string) {
        logger.info(`Added team member! Inviting to channel [${slackChannelId}] -> member @${approvedUserScreenName}`);
        await inviteUserToSlackChannel(ctx,
            slackTeam,
            slackChannelId,
            approvingUserSlackId);

        const msg: SlackMessage = {
            text: `Welcome to the team *@${approvedUserScreenName}*!`,
        };
        return await ctx.messageClient.addressChannels(msg, slackTeamChannel);
    }

    private async handleRejectedMembershipRequest(ctx: HandlerContext, teamName: string, rejectingUserScreenName: string, rejectedUserScreenName: string, teamChannel: string) {
        await ctx.messageClient.send(`Your membership request to team '${teamName}' has been rejected by @${rejectingUserScreenName}`,
            addressSlackUsers(QMConfig.teamId, rejectedUserScreenName));

        return await ctx.messageClient.addressChannels("Membership request rejected", teamChannel);
    }

    private async handleError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }
}
