import {HandlerContext, logger} from "@atomist/automation-client";
import * as _ from "lodash";
import {OpenShiftConfig} from "../../../config/OpenShiftConfig";
import {QMConfig} from "../../../config/QMConfig";
import {OCCommandResult} from "../../../openshift/base/OCCommandResult";
import {OCService} from "../../services/openshift/OCService";
import {
    getProjectId,
    OpenshiftProjectEnvironmentRequest,
} from "../../util/project/Project";
import {OCResultError} from "../../util/shared/Error";
import {
    DevOpsEnvironmentDetails,
    getDevOpsEnvironmentDetails,
} from "../../util/team/Teams";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

export class CreateOpenshiftEnvironments extends Task {

    private readonly TASK_HEADER = TaskListMessage.createUniqueTaskName("CreateOpenshiftEnvironments");
    private readonly TASK_CREATE_POD_NETWORK = TaskListMessage.createUniqueTaskName("PodNetwork");
    private dynamicTaskNameStore: { [k: string]: string } = {};

    constructor(private environmentsRequestedEvent: OpenshiftProjectEnvironmentRequest,
                private devopsEnvironmentDetails: DevOpsEnvironmentDetails = getDevOpsEnvironmentDetails(environmentsRequestedEvent.teams[0].name),
                private openshiftEnvironment: OpenShiftConfig = QMConfig.subatomic.openshiftNonProd,
                private ocService = new OCService()) {
        super();
    }

    protected configureTaskListMessage(taskListMessage: TaskListMessage) {
        this.taskListMessage.addTask(this.TASK_HEADER, `*Create project environments on ${this.openshiftEnvironment.name}*`);
        for (const environment of this.openshiftEnvironment.defaultEnvironments) {
            const internalTaskId = `${environment.id}Environment`;
            this.dynamicTaskNameStore[internalTaskId] = TaskListMessage.createUniqueTaskName(internalTaskId);
            this.taskListMessage.addTask(this.dynamicTaskNameStore[internalTaskId], `\tCreate ${environment.id} Environment`);
        }
        this.taskListMessage.addTask(this.TASK_CREATE_POD_NETWORK, "\tCreate project/devops pod network");
    }

    protected async executeTask(ctx: HandlerContext): Promise<boolean> {
        await this.createOpenshiftEnvironments();

        await this.createPodNetwork(
            this.environmentsRequestedEvent.owningTenant.name,
            this.environmentsRequestedEvent.project.name);

        await this.taskListMessage.succeedTask(this.TASK_CREATE_POD_NETWORK);
        await this.taskListMessage.succeedTask(this.TASK_HEADER);

        return true;
    }

    private async createOpenshiftEnvironments() {
        const environments = [];
        for (const environment of this.openshiftEnvironment.defaultEnvironments) {
            environments.push([environment.id, environment.description]);
        }

        await this.ocService.login(this.openshiftEnvironment);

        for (const environment of environments) {
            const projectId = getProjectId(this.environmentsRequestedEvent.owningTenant.name, this.environmentsRequestedEvent.project.name, environment[0]);
            logger.info(`Working with OpenShift project Id: ${projectId}`);

            await this.createOpenshiftProject(projectId, this.environmentsRequestedEvent, environment);
            await this.taskListMessage.succeedTask(this.dynamicTaskNameStore[`${environment[0]}Environment`]);
        }
    }

    private async createOpenshiftProject(projectId: string, environmentsRequestedEvent: OpenshiftProjectEnvironmentRequest, environment) {
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

    private async createPodNetwork(tenantName: string, projectName: string) {
        const teamDevOpsProjectId = this.devopsEnvironmentDetails.openshiftProjectId;
        const projectEnvironments = [];
        for (const environment of QMConfig.subatomic.openshiftNonProd.defaultEnvironments) {
            projectEnvironments.push(getProjectId(tenantName, projectName, environment.id));
        }
        try {
            await this.ocService.createPodNetwork(projectEnvironments, teamDevOpsProjectId);
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
