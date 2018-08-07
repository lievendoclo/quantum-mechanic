import {HandlerContext, logger} from "@atomist/automation-client";
import * as _ from "lodash";
import {OCCommandResult} from "../../../openshift/base/OCCommandResult";
import {OCService} from "../../services/openshift/OCService";
import {getProjectId} from "../../util/project/Project";
import {OCResultError} from "../../util/shared/Error";
import {getDevOpsEnvironmentDetails} from "../../util/team/Teams";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

export class CreateOpenshiftEnvironments extends Task {

    private readonly TASK_CREATE_POD_NETWORK = "PodNetwork";

    constructor(private environmentsRequestedEvent, private ocService = new OCService()) {
        super();
    }

    protected configureTaskListMessage(taskListMessage: TaskListMessage) {
        this.taskListMessage.addTask("devEnvironment", "Create Dev Environment");
        this.taskListMessage.addTask("sitEnvironment", "Create SIT Environment");
        this.taskListMessage.addTask("uatEnvironment", "Create UAT Environment");
        this.taskListMessage.addTask(this.TASK_CREATE_POD_NETWORK, "Create project/devops pod network");
    }

    protected async executeTask(ctx: HandlerContext): Promise<boolean> {
        await this.createOpenshiftEnvironments();

        await this.createPodNetwork(
            this.environmentsRequestedEvent.teams[0].name,
            this.environmentsRequestedEvent.owningTenant.name,
            this.environmentsRequestedEvent.project.name);

        await this.taskListMessage.succeedTask(this.TASK_CREATE_POD_NETWORK);

        return true;
    }

    private async createOpenshiftEnvironments() {
        const environments = [["dev", "Development"],
            ["sit", "Integration testing"],
            ["uat", "User acceptance"]];

        await this.ocService.login();

        for (const environment of environments) {
            const projectId = getProjectId(this.environmentsRequestedEvent.owningTenant.name, this.environmentsRequestedEvent.project.name, environment[0]);
            logger.info(`Working with OpenShift project Id: ${projectId}`);

            await this.createOpenshiftProject(projectId, this.environmentsRequestedEvent, environment);
            await this.taskListMessage.succeedTask(`${environment[0]}Environment`);
        }
    }

    private async createOpenshiftProject(projectId: string, environmentsRequestedEvent, environment) {
        try {
            await this.ocService.newSubatomicProject(
                projectId,
                environmentsRequestedEvent.project.name,
                environmentsRequestedEvent.owningTenant.name,
                environment);
        } catch (err) {
            logger.warn(err);
        } finally {
            await this.ocService.initilizeProjectWithDefaultProjectTemplate(projectId);
            await environmentsRequestedEvent.teams.map(async team => {
                await this.ocService.addTeamMembershipPermissionsToProject(projectId, team);
            });
        }

        await this.createProjectQuotasAndLimits(projectId);
    }

    private async createProjectQuotasAndLimits(projectId: string) {
        await this.ocService.createProjectDefaultResourceQuota(projectId);
        await this.ocService.createProjectDefaultLimits(projectId);
    }

    private async createPodNetwork(teamName: string, tenantName: string, projectName: string) {
        const teamDevOpsProjectId = getDevOpsEnvironmentDetails(teamName).openshiftProjectId;
        const projectIdDev = getProjectId(tenantName, projectName, "dev");
        const projectIdSit = getProjectId(tenantName, projectName, "sit");
        const projectIdUat = getProjectId(tenantName, projectName, "uat");
        try {
            await this.ocService.createPodNetwork([projectIdDev, projectIdSit, projectIdUat], teamDevOpsProjectId);
        } catch (error) {
            if (error instanceof OCCommandResult) {
                const multitenantNetworkPluginMissingError = "error: managing pod network is only supported for openshift multitenant network plugin";
                if (!_.isEmpty(error.error) && error.error.toLowerCase().indexOf(multitenantNetworkPluginMissingError) > -1) {
                    logger.warn("Openshift multitenant network plugin not found. Assuming running on Minishift test environment");
                } else {
                    throw new OCResultError(error, "Failed to configure multitenant pod network");
                }
            } else {
                throw error;
            }
        }
    }

}
