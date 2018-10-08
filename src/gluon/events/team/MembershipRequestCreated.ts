import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    success,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {
    addressSlackChannelsFromContext,
    addressSlackUsersFromContext,
} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage} from "@atomist/slack-messages";
import {v4 as uuid} from "uuid";
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

        await this.tryAddressMember(ctx, `A membership request to team '${membershipRequestCreatedEvent.team.name}' has been sent for approval`, membershipRequestCreatedEvent.requestedBy);

        if (membershipRequestCreatedEvent.team.slackIdentity !== null) {
            const correlationId: string = uuid();
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
                                correlationId,
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
                                correlationId,
                            }),
                    ],
                }],
            };
            logger.info(membershipRequestCreatedEvent.team.slackIdentity.teamChannel);
            const destination =  await addressSlackChannelsFromContext(ctx, membershipRequestCreatedEvent.team.slackIdentity.teamChannel);
            return await ctx.messageClient.send(msg, destination, {id: correlationId});
        }

        return await this.tryAddressMember(ctx, "Please note, the team applied to has no associated slack channel. Approval needs to occur through other avenues.", membershipRequestCreatedEvent.requestedBy);
    }

    private async tryAddressMember(ctx: HandlerContext, message: string, member) {
        if (member.slackIdentity !== null) {
            const destination =  await addressSlackUsersFromContext(ctx, member.slackIdentity.screenName);
            return await ctx.messageClient.send(message,
                destination);
        }
        return await success();
    }
}
