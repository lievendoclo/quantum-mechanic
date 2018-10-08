import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
} from "@atomist/automation-client";
import {addressSlackChannelsFromContext} from "@atomist/automation-client/spi/message/MessageClient";
import {url} from "@atomist/slack-messages";
import {QMConfig} from "../../../config/QMConfig";

@EventHandler("Receive TeamsLinkedToProject events", `
subscription TeamsLinkedToProjectEvent {
  TeamsLinkedToProjectEvent {
    id
    team {
      teamId
      name
      description
      slackIdentity {
        teamChannel
      }
    }
    requestedBy {
      firstName
      slackIdentity {
        screenName
      }
    }
  }
}
`)
export class TeamsLinkedToProject implements HandleEvent<any> {

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested TeamAssociated event: ${JSON.stringify(event.data)}`);

        const teamsLinkedToProjectEvent = event.data.TeamsLinkedToProjectEvent[0];

        const destination =  await addressSlackChannelsFromContext(ctx, teamsLinkedToProjectEvent.team[0].slackIdentity.teamChannel);
        return ctx.messageClient.send(`Your team has been successfully associated with ${teamsLinkedToProjectEvent.id}`,
            destination);
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/user-guide/create-a-team#associate-a-slack-channel`,
            "documentation")}`;
    }
}
