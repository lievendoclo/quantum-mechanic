import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
} from "@atomist/automation-client";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {OCService} from "../../services/openshift/OCService";
import {CreateOpenshiftResourcesInProject} from "../../tasks/project/CreateOpenshiftResourcesInProject";
import {TaskListMessage} from "../../tasks/TaskListMessage";
import {TaskRunner} from "../../tasks/TaskRunner";
import {ChannelMessageClient, handleQMError} from "../../util/shared/Error";

@EventHandler("Receive ApplicationProdRequestedEvent events", `
subscription ApplicationProdRequestedEvent {
  ApplicationProdRequestedEvent {
    id
    applicationProdRequest{
      applicationProdRequestId
    }
    application {
      applicationId
      name
      description
      applicationType
    }
    project {
      projectId
      name
      description
      tenant {
        tenantId
      }
    }
    owningTeam {
      teamId
      name
      slackIdentity {
        teamChannel
      }
    }
    teams {
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
      }
    }
  }
}
`)
export class ApplicationProdRequested implements HandleEvent<any> {

    constructor(public ocService = new OCService(),
                public gluonService = new GluonService()) {
    }

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested ApplicationProdRequestedEvent event: ${JSON.stringify(event.data)}`);

        const applicationProdRequestedEvent = event.data.ApplicationProdRequestedEvent[0];

        const qmMessageClient = this.createMessageClient(ctx, applicationProdRequestedEvent.teams);

        try {
            const project = applicationProdRequestedEvent.project;

            const tenant = await this.gluonService.tenants.gluonTenantFromTenantId(project.tenant.tenantId);

            const applicationProdRequest = await this.gluonService.prod.application.getApplicationProdRequestById(applicationProdRequestedEvent.applicationProdRequest.applicationProdRequestId);

            const resources = this.getRequestedProdResources(applicationProdRequest);

            const taskListMessage: TaskListMessage = new TaskListMessage(`🚀 Creating requested application resources in project *${project.name}* production environments started:`,
                qmMessageClient);

            const taskRunner: TaskRunner = new TaskRunner(taskListMessage);

            for (const openshiftProd of QMConfig.subatomic.openshiftProd) {
                taskRunner.addTask(new CreateOpenshiftResourcesInProject(project.name, tenant.name, openshiftProd, resources));
            }

            await taskRunner.execute(ctx);

            return await qmMessageClient.send("Resources successfully created in production environments.");
        } catch (error) {
            return await handleQMError(qmMessageClient, error);
        }
    }

    private getRequestedProdResources(applicationProdRequest: any) {
        const resources = {
            kind: "List",
            apiVersion: "v1",
            metadata: {},
            items: [],
        };
        for (const openShiftResource of applicationProdRequest.openShiftResources) {
            resources.items.push(JSON.parse(openShiftResource.resourceDetails));
        }
        return resources;
    }

    private createMessageClient(ctx: HandlerContext, teams) {
        const qmMessageClient = new ChannelMessageClient(ctx);
        for (const team of teams) {
            qmMessageClient.addDestination(team.slackIdentity.teamChannel);
        }
        return qmMessageClient;
    }

}
