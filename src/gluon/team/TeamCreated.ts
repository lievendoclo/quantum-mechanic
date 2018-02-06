import {
    EventFired, EventHandler, HandleEvent, HandlerContext, HandlerResult,
    logger, success,
} from "@atomist/automation-client";
import {
    addressSlackUsers,
    buttonForCommand,
} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import * as _ from "lodash";
import {NewDevOpsEnvironment} from "./DevOpsEnvironment";
import {NewOrUseTeamSlackChannel} from "./TeamSlackChannel";

@EventHandler("Receive TeamCreated events", `
subscription TeamCreatedEvent {
  TeamCreatedEvent {
    id
    team {
      teamId
      name
      description
    }
    createdBy {
      firstName
      slackIdentity {
        screenName
      }
    }
  }
}
`)
export class TeamCreated implements HandleEvent<any> {

    public handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested TeamCreated event: ${JSON.stringify(event.data)}`);

        // TODO if team channel already exists, then send a message there about the new Subatomic team
        // also update the Team with that existing team channel

        const teamCreatedEvent = event.data.TeamCreatedEvent[0];
        const text: string = `
${teamCreatedEvent.createdBy.firstName}, your ${teamCreatedEvent.team.name} team has been successfully created 👍.
Next you should configure your team Slack channel and OpenShift DevOps environment
                            `;
        const msg: SlackMessage = {
            text,
            attachments: [{
                fallback: "Next you should configure your team Slack channel and OpenShift DevOps environment",
                footer: `For more information, please read the ${this.docs()}`, // TODO use actual icon
                actions: [
                    buttonForCommand(
                        {text: "Team Slack channel"},
                        new NewOrUseTeamSlackChannel(),
                        {
                            teamName: teamCreatedEvent.team.name,
                            teamChannel: _.kebabCase(teamCreatedEvent.team.name),
                        }),
                    // buttonForCommand(
                    //     {text: "OpenShift DevOps environment"},
                    //     new NewDevOpsEnvironment())
                ],
            }],
        };

        // TODO fix the below if not created from Slack
        return ctx.messageClient.send(msg,
            addressSlackUsers("T8RGCS6T0", teamCreatedEvent.createdBy.slackIdentity.screenName));
    }

    private docs(): string {
        return `${url("https://subatomic.bison.absa.co.za/docs/teams#new",
            "documentation")}`;
    }
}
