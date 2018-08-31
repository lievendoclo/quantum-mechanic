import {HandlerContext, logger} from "@atomist/automation-client";
import {OpenShiftConfig} from "../../../config/OpenShiftConfig";
import {QMConfig} from "../../../config/QMConfig";
import {OCService} from "../../services/openshift/OCService";
import {
    DevOpsEnvironmentDetails,
    getDevOpsEnvironmentDetails,
    QMTeam,
} from "../../util/team/Teams";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

export class CreateTeamDevOpsEnvironment extends Task {

    private readonly TASK_HEADER = TaskListMessage.createUniqueTaskName("CreateTeamDevOpsEnvironmentHeader");
    private readonly TASK_OPENSHIFT_ENV = TaskListMessage.createUniqueTaskName("OpenshiftEnv");
    private readonly TASK_OPENSHIFT_PERMISSIONS = TaskListMessage.createUniqueTaskName("OpenshiftPermissions");
    private readonly TASK_OPENSHIFT_RESOURCES = TaskListMessage.createUniqueTaskName("Resources");
    private readonly TASK_SECRETS = TaskListMessage.createUniqueTaskName("ConfigSecrets");

    constructor(private devOpsRequestedEvent: { team: QMTeam },
                private devopsEnvironmentDetails: DevOpsEnvironmentDetails = getDevOpsEnvironmentDetails(devOpsRequestedEvent.team.name),
                private openshiftEnvironment: OpenShiftConfig = QMConfig.subatomic.openshiftNonProd,
                private ocService = new OCService()) {
        super();
    }

    protected configureTaskListMessage(taskListMessage: TaskListMessage) {
        taskListMessage.addTask(this.TASK_HEADER, `*Create DevOpsEnvironment on ${this.openshiftEnvironment.name}*`);
        taskListMessage.addTask(this.TASK_OPENSHIFT_ENV, `\tCreate DevOps Openshift Project`);
        taskListMessage.addTask(this.TASK_OPENSHIFT_PERMISSIONS, `\tAdd Openshift Permissions`);
        taskListMessage.addTask(this.TASK_OPENSHIFT_RESOURCES, `\tCopy Subatomic resources to DevOps Project`);
        taskListMessage.addTask(this.TASK_SECRETS, `\tAdd Secrets`);
    }

    protected async executeTask(ctx: HandlerContext): Promise<boolean> {
        const projectId = this.devopsEnvironmentDetails.openshiftProjectId;
        logger.info(`Working with OpenShift project Id: ${projectId}`);

        await this.ocService.login(this.openshiftEnvironment);

        await this.createDevOpsEnvironment(projectId, this.devOpsRequestedEvent.team.name);

        await this.taskListMessage.succeedTask(this.TASK_OPENSHIFT_ENV);

        await this.ocService.addTeamMembershipPermissionsToProject(projectId,
            this.devOpsRequestedEvent.team);

        await this.taskListMessage.succeedTask(this.TASK_OPENSHIFT_PERMISSIONS);

        await this.copySubatomicAppTemplatesToDevOpsEnvironment(projectId);
        await this.ocService.tagAllSubatomicImageStreamsToDevOpsEnvironment(projectId);

        await this.taskListMessage.succeedTask(this.TASK_OPENSHIFT_RESOURCES);

        await this.addBitbucketSSHSecret(projectId);

        await this.taskListMessage.succeedTask(this.TASK_SECRETS);

        await this.taskListMessage.succeedTask(this.TASK_HEADER);

        return true;
    }

    private async createDevOpsEnvironment(projectId: string, teamName: string) {
        try {
            await this.ocService.newDevOpsProject(projectId, teamName);
        } catch (error) {
            logger.warn("DevOps project already seems to exist. Trying to continue.");
        }

        await this.ocService.createDevOpsDefaultResourceQuota(projectId);

        await this.ocService.createDevOpsDefaultLimits(projectId);

        return {};
    }

    private async copySubatomicAppTemplatesToDevOpsEnvironment(projectId: string) {
        logger.info(`Finding templates in subatomic namespace`);

        const appTemplatesJSON = await this.ocService.getSubatomicAppTemplates();

        const appTemplates: any = JSON.parse(appTemplatesJSON.output);
        for (const item of appTemplates.items) {
            item.metadata.namespace = projectId;
        }
        await this.ocService.createResourceFromDataInNamespace(appTemplates, projectId);
    }

    private async addBitbucketSSHSecret(projectId: string) {
        try {
            await this.ocService.getSecretFromNamespace("bitbucket-ssh", projectId);
            logger.warn("Bitbucket SSH secret must already exist");
        } catch (error) {
            await this.ocService.createBitbucketSSHAuthSecret("bitbucket-ssh", projectId);
        }
    }

}
