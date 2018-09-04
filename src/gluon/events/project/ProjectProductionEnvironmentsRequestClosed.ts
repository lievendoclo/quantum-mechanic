import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    success,
} from "@atomist/automation-client";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {CreateOpenshiftEnvironments} from "../../tasks/project/CreateOpenshiftEnvironments";
import {TaskListMessage} from "../../tasks/TaskListMessage";
import {TaskRunner} from "../../tasks/TaskRunner";
import {CreateTeamDevOpsEnvironment} from "../../tasks/team/CreateTeamDevOpsEnvironment";
import {OpenshiftProjectEnvironmentRequest} from "../../util/project/Project";
import {ChannelMessageClient, handleQMError} from "../../util/shared/Error";
import {getDevOpsEnvironmentDetailsProd} from "../../util/team/Teams";

@EventHandler("Receive ProjectProductionEnvironmentsRequestClosedEvent events", `
subscription ProjectProductionEnvironmentsRequestClosedEvent {
  ProjectProductionEnvironmentsRequestClosedEvent {
    id
    projectProdRequestId
  }
}
`)
export class ProjectProductionEnvironmentsRequestClosed implements HandleEvent<any> {

    constructor(public gluonService = new GluonService()) {
    }

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested ProjectProductionEnvironmentsRequestClosedEvent event: ${JSON.stringify(event.data)}`);

        const projectProductionRequestClosedEvent = event.data.ProjectProductionEnvironmentsRequestClosedEvent[0];

        logger.info("Trying to find projectProdRequestDetails");

        const projectProdRequest = await this.gluonService.prod.project.getProjectProdRequestById(projectProductionRequestClosedEvent.projectProdRequestId);

        const associatedTeams = await this.gluonService.teams.getTeamsAssociatedToProject(projectProdRequest.project.projectId);

        const qmMessageClient = this.createMessageClient(ctx, associatedTeams);

        try {
            if (projectProdRequest.approvalStatus === "APPROVED") {
                await qmMessageClient.send(`Prod request for project ${projectProdRequest.project.name} was approved.`);

                const project = await this.gluonService.projects.gluonProjectFromProjectName(projectProdRequest.project.name);

                const owningTeam = await this.gluonService.teams.gluonTeamById(project.owningTeam.teamId);

                const owningTenant = await this.gluonService.tenants.gluonTenantFromTenantId(project.owningTenant);

                const taskListMessage: TaskListMessage = new TaskListMessage(`🚀 Provisioning of environment's for project *${project.name}* started:`,
                    qmMessageClient);

                const taskRunner: TaskRunner = new TaskRunner(taskListMessage);

                const request: OpenshiftProjectEnvironmentRequest = await this.createEnvironmentRequest(project, associatedTeams, owningTenant);

                for (const prodOpenshift of QMConfig.subatomic.openshiftProd) {

                    const devopsEnvironmentDetails = getDevOpsEnvironmentDetailsProd(owningTeam.name);

                    taskRunner.addTask(new CreateTeamDevOpsEnvironment({team: owningTeam}, devopsEnvironmentDetails, prodOpenshift));
                    taskRunner.addTask(
                        new CreateOpenshiftEnvironments(request, devopsEnvironmentDetails, prodOpenshift),
                    );
                }

                await taskRunner.execute(ctx);

                await qmMessageClient.send("Successfully created requested project environments.");
            } else {
                logger.info(`Closed prod request: ${JSON.stringify(projectProdRequest, null, 2)}`);
                await qmMessageClient.send(`Prod request for project ${projectProdRequest.project.name} was rejected and closed by @${projectProdRequest.rejectingMember.slack.screenName}`);
            }
            return await success();
        } catch (error) {
            return await handleQMError(qmMessageClient, error);
        }
    }

    private async createEnvironmentRequest(project, associatedTeams, owningTenant): Promise<OpenshiftProjectEnvironmentRequest> {
        return {
            teams: associatedTeams,
            project,
            owningTenant,
        };
    }

    private createMessageClient(ctx: HandlerContext,
                                teams: Array<{ slack: { teamChannel: string } }>) {
        const messageClient = new ChannelMessageClient(ctx);
        teams.map(team => {
            messageClient.addDestination(team.slack.teamChannel);
        });
        return messageClient;
    }
}
