import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
} from "@atomist/automation-client";
import {url} from "@atomist/slack-messages";
import {QMConfig} from "../../config/QMConfig";

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

    public handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested TeamAssociated event: ${JSON.stringify(event.data)}`);

        const teamsLinkedToProjectEvent = event.data.TeamsLinkedToProjectEvent[0];

        return ctx.messageClient.addressChannels(`Your team has been successfully associated with ${teamsLinkedToProjectEvent.id}`,
            teamsLinkedToProjectEvent.team[0].slackIdentity.teamChannel);
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/user-guide/create-a-team#associate-a-slack-channel`,
            "documentation")}`;
    }
}
