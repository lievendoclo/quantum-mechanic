import {HandlerContext, logger} from "@atomist/automation-client";
import {addressSlackChannelsFromContext} from "@atomist/automation-client/spi/message/MessageClient";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {DevOpsMessages} from "../../messages/team/DevOpsMessages";
import {JenkinsService} from "../../services/jenkins/JenkinsService";
import {OCService} from "../../services/openshift/OCService";
import {
    getJenkinsBitbucketProjectCredential,
    getJenkinsDockerCredential,
    getJenkinsMavenCredential,
    getJenkinsNexusCredential,
} from "../../util/jenkins/JenkinsCredentials";
import {
    roleBindingDefinition,
    serviceAccountDefinition,
} from "../../util/jenkins/JenkinsOpenshiftResources";
import {QMError} from "../../util/shared/Error";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

const promiseRetry = require("promise-retry");

export class AddJenkinsToDevOpsEnvironment extends Task {

    private devopsMessages = new DevOpsMessages();

    private readonly TASK_HEADER = TaskListMessage.createUniqueTaskName("ConfigureDevOpsJenkins");
    private readonly TASK_TAG_TEMPLATE = TaskListMessage.createUniqueTaskName("TagTemplate");
    private readonly TASK_ROLLOUT_JENKINS = TaskListMessage.createUniqueTaskName("RolloutJenkins");
    private readonly TASK_CONFIG_JENKINS = TaskListMessage.createUniqueTaskName("ConfigJenkins");

    constructor(private devOpsRequestedEvent,
                private jenkinsService = new JenkinsService(),
                private ocService = new OCService()) {
        super();
    }

    protected configureTaskListMessage(taskListMessage: TaskListMessage) {
        taskListMessage.addTask(this.TASK_HEADER, `*Create DevOps Jenkins*`);
        taskListMessage.addTask(this.TASK_TAG_TEMPLATE, "\tTag jenkins template to environment");
        taskListMessage.addTask(this.TASK_ROLLOUT_JENKINS, "\tRollout Jenkins instance");
        taskListMessage.addTask(this.TASK_CONFIG_JENKINS, "\tConfigure Jenkins");
    }

    protected async executeTask(ctx: HandlerContext): Promise<boolean> {

        const projectId = `${_.kebabCase(this.devOpsRequestedEvent.team.name).toLowerCase()}-devops`;
        logger.info(`Working with OpenShift project Id: ${projectId}`);

        await this.ocService.login();

        await this.copyJenkinsTemplateToDevOpsEnvironment(projectId);

        await this.taskListMessage.succeedTask(this.TASK_TAG_TEMPLATE);

        await this.createJenkinsDeploymentConfig(projectId);

        await this.createJenkinsServiceAccount(projectId);

        await this.rolloutJenkinsDeployment(projectId);

        await this.taskListMessage.succeedTask(this.TASK_ROLLOUT_JENKINS);

        const jenkinsHost: string = await this.createJenkinsRoute(projectId);

        const token: string = await this.ocService.getServiceAccountToken("subatomic-jenkins", projectId);

        logger.info(`Using Service Account token: ${token}`);

        await this.addJenkinsCredentials(projectId, jenkinsHost, token);

        await this.taskListMessage.succeedTask(this.TASK_CONFIG_JENKINS);

        await this.taskListMessage.succeedTask(this.TASK_HEADER);

        const destination = await addressSlackChannelsFromContext(ctx, this.devOpsRequestedEvent.team.slackIdentity.teamChannel);
        await ctx.messageClient.send(
            this.devopsMessages.jenkinsSuccessfullyProvisioned(jenkinsHost, this.devOpsRequestedEvent.team.name),
            destination,
        );

        return true;
    }

    private async copyJenkinsTemplateToDevOpsEnvironment(projectId: string) {
        const jenkinsTemplateJSON = await this.ocService.getJenkinsTemplate();

        const jenkinsTemplate: any = JSON.parse(jenkinsTemplateJSON.output);
        jenkinsTemplate.metadata.namespace = projectId;
        await this.ocService.applyResourceFromDataInNamespace(jenkinsTemplate, projectId);
    }

    private async createJenkinsDeploymentConfig(projectId: string) {
        logger.info("Processing Jenkins QMTemplate...");
        const jenkinsTemplateResultJSON = await this.ocService.processJenkinsTemplateForDevOpsProject(projectId);
        logger.debug(`Processed Jenkins Template: ${jenkinsTemplateResultJSON.output}`);

        try {
            await this.ocService.getDeploymentConfigInNamespace("jenkins", projectId);
            logger.warn("Jenkins QMTemplate has already been processed, deployment exists");
        } catch (error) {
            await this.ocService.applyResourceFromDataInNamespace(JSON.parse(jenkinsTemplateResultJSON.output), projectId);
        }
    }

    private async createJenkinsServiceAccount(projectId: string) {
        await this.ocService.applyResourceFromDataInNamespace(serviceAccountDefinition(), projectId);

        await this.ocService.applyResourceFromDataInNamespace(roleBindingDefinition(), projectId, true);
    }

    private async rolloutJenkinsDeployment(projectId) {
        await promiseRetry((retryFunction, attemptCount: number) => {
            logger.debug(`Jenkins rollout status check attempt number ${attemptCount}`);

            return this.ocService.rolloutDeploymentConfigInNamespace("jenkins", projectId)
                .then(rolloutStatus => {
                    logger.debug(JSON.stringify(rolloutStatus.output));

                    if (rolloutStatus.output.indexOf("successfully rolled out") === -1) {
                        retryFunction();
                    }
                });
        }, {
            // Retry for up to 8 mins
            factor: 1,
            retries: 59,
            minTimeout: 20000,
        });
    }

    private async createJenkinsRoute(projectId: string): Promise<string> {

        await this.ocService.annotateJenkinsRoute(projectId);
        const jenkinsHost = await this.ocService.getJenkinsHost(projectId);

        return jenkinsHost.output;
    }

    private async addJenkinsCredentials(projectId: string, jenkinsHost: string, token: string) {
        logger.debug(`Using Jenkins Route host [${jenkinsHost}] to add Bitbucket credentials`);
        const bitbucketCredentials = getJenkinsBitbucketProjectCredential(projectId);

        await this.createGlobalCredentialsFor("Bitbucket", jenkinsHost, token, projectId, bitbucketCredentials);

        const nexusCredentials = getJenkinsNexusCredential();

        await this.createGlobalCredentialsFor("Nexus", jenkinsHost, token, projectId, nexusCredentials);

        const dockerRegistryCredentials = getJenkinsDockerCredential();

        await this.createGlobalCredentialsFor("Docker", jenkinsHost, token, projectId, dockerRegistryCredentials);

        const mavenCredentials = getJenkinsMavenCredential();

        await this.createGlobalCredentialsFor("Maven", jenkinsHost, token, projectId, mavenCredentials, {
            filePath: QMConfig.subatomic.maven.settingsPath,
            fileName: "settings.xml",
        });
    }

    private async createGlobalCredentialsFor(forName: string, jenkinsHost: string, token: string, projectId: string, credentials, fileDetails: { fileName: string, filePath: string } = null) {
        try {
            await this.jenkinsService.createJenkinsCredentialsWithRetries(6, 5000, jenkinsHost, token, projectId, credentials, fileDetails);
        } catch (error) {
            throw new QMError(`Failed to create ${forName} Global Credentials in Jenkins`);
        }
    }

}
