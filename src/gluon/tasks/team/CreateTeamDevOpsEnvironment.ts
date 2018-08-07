import {HandlerContext, logger} from "@atomist/automation-client";
import * as _ from "lodash";
import {OCService} from "../../services/openshift/OCService";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

export class CreateTeamDevOpsEnvironment extends Task {

    private readonly TASK_OPENSHIFT_ENV = "OpenshiftEnv";
    private readonly TASK_OPENSHIFT_PERMISSIONS = "OpenshiftPermissions";
    private readonly TASK_OPENSHIFT_RESOURCES = "Resources";
    private readonly TASK_SECRETS = "ConfigSecrets";

    constructor(private devOpsRequestedEvent, private ocService = new OCService()) {
        super();
    }

    protected configureTaskListMessage(taskListMessage: TaskListMessage) {
        taskListMessage.addTask(this.TASK_OPENSHIFT_ENV, "Create DevOps Openshift Project");
        taskListMessage.addTask(this.TASK_OPENSHIFT_PERMISSIONS, "Add Openshift Permissions");
        taskListMessage.addTask(this.TASK_OPENSHIFT_RESOURCES, "Copy Subatomic resources to DevOps Project");
        taskListMessage.addTask(this.TASK_SECRETS, "Add Secrets");
    }

    protected async executeTask(ctx: HandlerContext): Promise<boolean> {
        const projectId = `${_.kebabCase(this.devOpsRequestedEvent.team.name).toLowerCase()}-devops`;
        logger.info(`Working with OpenShift project Id: ${projectId}`);

        await this.ocService.login();

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
