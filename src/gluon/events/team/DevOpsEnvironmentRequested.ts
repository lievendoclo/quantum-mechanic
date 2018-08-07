import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
} from "@atomist/automation-client";
import {addressEvent} from "@atomist/automation-client/spi/message/MessageClient";
import {timeout, TimeoutError} from "promise-timeout";
import {TaskListMessage} from "../../tasks/TaskListMessage";
import {TaskRunner} from "../../tasks/TaskRunner";
import {AddJenkinsToDevOpsEnvironment} from "../../tasks/team/AddJenkinsToDevOpsEnvironment";
import {CreateTeamDevOpsEnvironment} from "../../tasks/team/CreateTeamDevOpsEnvironment";
import {ChannelMessageClient, handleQMError} from "../../util/shared/Error";
import {getDevOpsEnvironmentDetails} from "../../util/team/Teams";

@EventHandler("Receive DevOpsEnvironmentRequestedEvent events", `
subscription DevOpsEnvironmentRequestedEvent {
  DevOpsEnvironmentRequestedEvent {
    id
    team {
      teamId
      name
      slackIdentity {
        teamChannel
      }
      owners {
        firstName
        domainUsername
        slackIdentity {
          screenName
        }
      }
      members {
        firstName
        domainUsername
        slackIdentity {
          screenName
        }
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
export class DevOpsEnvironmentRequested implements HandleEvent<any> {

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested DevOpsEnvironmentRequestedEvent event: ${JSON.stringify(event.data)}`);

        const devOpsRequestedEvent = event.data.DevOpsEnvironmentRequestedEvent[0];

        try {
            const teamChannel = devOpsRequestedEvent.team.slackIdentity.teamChannel;
            const taskListMessage = new TaskListMessage(`🚀 Provisioning of DevOps environment for team *${devOpsRequestedEvent.team.name}* started:`, new ChannelMessageClient(ctx).addDestination(teamChannel));
            const taskRunner = new TaskRunner(taskListMessage);

            taskRunner.addTask(
                new CreateTeamDevOpsEnvironment(devOpsRequestedEvent),
            ).addTask(
                new AddJenkinsToDevOpsEnvironment(devOpsRequestedEvent),
            );

            await taskRunner.execute(ctx);

            const devopsEnvironmentProvisionedEvent = {
                team: devOpsRequestedEvent.team,
                devOpsEnvironment: getDevOpsEnvironmentDetails(devOpsRequestedEvent.team.name),
            };

            return await ctx.messageClient.send(devopsEnvironmentProvisionedEvent, addressEvent("DevOpsEnvironmentProvisionedEvent"));

        } catch (error) {
            return await this.handleError(ctx, error, devOpsRequestedEvent.team.slackIdentity.teamChannel);
        }
    }

    private async handleError(ctx: HandlerContext, error, teamChannel: string) {
        return await handleQMError(new ChannelMessageClient(ctx).addDestination(teamChannel), error);
    }
}
