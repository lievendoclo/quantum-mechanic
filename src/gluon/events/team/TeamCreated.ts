import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
} from "@atomist/automation-client";
import {
    addressSlackUsers,
    buttonForCommand,
} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {NewOrUseTeamSlackChannel} from "../../commands/team/NewOrExistingTeamSlackChannel";

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

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested TeamCreated event: ${JSON.stringify(event.data)}`);

        const teamCreatedEvent = event.data.TeamCreatedEvent[0];
        const text: string = `
${teamCreatedEvent.createdBy.firstName}, your ${teamCreatedEvent.team.name} team has been successfully created 👍.
Next you should configure your team Slack channel and OpenShift DevOps environment
                            `;
        const msg: SlackMessage = {
            text,
            attachments: [{
                fallback: "Next you should configure your team Slack channel and OpenShift DevOps environment",
                footer: `For more information, please read the ${this.docs()}`,
                thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
                actions: [
                    buttonForCommand(
                        {text: "Team Slack channel"},
                        new NewOrUseTeamSlackChannel(),
                        {
                            teamName: teamCreatedEvent.team.name,
                            teamChannel: _.kebabCase(teamCreatedEvent.team.name),
                        }),
                ],
            }],
        };

        return await ctx.messageClient.send(msg,
            addressSlackUsers(QMConfig.teamId, teamCreatedEvent.createdBy.slackIdentity.screenName));
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/user-guide/create-a-team#associate-a-slack-channel`,
            "documentation")}`;
    }
}
