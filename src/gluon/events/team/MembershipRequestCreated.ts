import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    success,
} from "@atomist/automation-client";
import {
    addressSlackUsers,
    buttonForCommand,
} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage} from "@atomist/slack-messages";
import {QMConfig} from "../../../config/QMConfig";
import {MembershipRequestClosed} from "./MembershipRequestClosed";

@EventHandler("Receive MembershipRequestCreated events", `
subscription MembershipRequestCreatedEvent {
  MembershipRequestCreatedEvent {
    id
    membershipRequestId
    team {
      teamId
      name
      slackIdentity {
        teamChannel
      }
    }
    requestedBy {
      firstName
      slackIdentity {
        screenName
        userId
      }
    }
  }
}
`)
export class MembershipRequestCreated implements HandleEvent<any> {

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested MembershipRequestCreated event: ${JSON.stringify(event.data)}`);

        const membershipRequestCreatedEvent = event.data.MembershipRequestCreatedEvent[0];

        await this.tryAddressMember(ctx, `A membership request to team '${membershipRequestCreatedEvent.team.name}' has been sent for approval`, membershipRequestCreatedEvent.requestedBy.slackIdentity.screenName);

        if (membershipRequestCreatedEvent.team.slackIdentity !== null) {
            const msg: SlackMessage = {
                text: `User @${membershipRequestCreatedEvent.requestedBy.slackIdentity.screenName} has requested to be added as a team member.`,
                attachments: [{
                    fallback: `User @${membershipRequestCreatedEvent.requestedBy.slackIdentity.screenName} has requested to be added as a team member`,
                    text: `
                        A team owner should approve/reject this user's membership request`,
                    mrkdwn_in: ["text"],
                    actions: [
                        buttonForCommand(
                            {text: "Accept"},
                            new MembershipRequestClosed(),
                            {
                                membershipRequestId: membershipRequestCreatedEvent.membershipRequestId,
                                teamId: membershipRequestCreatedEvent.team.teamId,
                                teamName: membershipRequestCreatedEvent.team.name,
                                userScreenName: membershipRequestCreatedEvent.requestedBy.slackIdentity.screenName,
                                userSlackId: membershipRequestCreatedEvent.requestedBy.slackIdentity.userId,
                                approvalStatus: "APPROVED",
                            }),
                        buttonForCommand(
                            {text: "Reject"},
                            new MembershipRequestClosed(),
                            {
                                membershipRequestId: membershipRequestCreatedEvent.membershipRequestId,
                                teamId: membershipRequestCreatedEvent.team.teamId,
                                teamName: membershipRequestCreatedEvent.team.name,
                                userScreenName: membershipRequestCreatedEvent.requestedBy.slackIdentity.screenName,
                                userSlackId: membershipRequestCreatedEvent.requestedBy.slackIdentity.userId,
                                approvalStatus: "REJECTED",
                            }),
                    ],
                }],
            };
            logger.info(membershipRequestCreatedEvent.team.slackIdentity.teamChannel);
            return await ctx.messageClient.addressChannels(msg, membershipRequestCreatedEvent.team.slackIdentity.teamChannel);
        }

        return await this.tryAddressMember(ctx, "Please note, the team applied to has no associated slack channel. Approval needs to occur through other avenues.", membershipRequestCreatedEvent.requestedBy);
    }

    private async tryAddressMember(ctx: HandlerContext, message: string, member) {
        if (member.slackIdentity !== null) {
            return await ctx.messageClient.send(message,
                addressSlackUsers(QMConfig.teamId, member.slackIdentity.screenName));
        }
        return await success();
    }
}
