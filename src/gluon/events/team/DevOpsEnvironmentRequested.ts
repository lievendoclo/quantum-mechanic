import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import * as _ from "lodash";
import {timeout, TimeoutError} from "promise-timeout";
import {QMConfig} from "../../../config/QMConfig";
import {AddConfigServer} from "../../commands/project/AddConfigServer";
import {CreateProject} from "../../commands/project/CreateProject";
import {JenkinsService} from "../../util/jenkins/Jenkins";
import {OCService} from "../../util/openshift/OCService";
import {
    ChannelMessageClient,
    handleQMError,
    QMError,
} from "../../util/shared/Error";
import {TaskListMessage, TaskStatus} from "../../util/shared/TaskListMessage";

const promiseRetry = require("promise-retry");

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

    constructor(private jenkinsService = new JenkinsService(),
                private ocService = new OCService()) {
    }

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested DevOpsEnvironmentRequestedEvent event: ${JSON.stringify(event.data)}`);

        const devOpsRequestedEvent = event.data.DevOpsEnvironmentRequestedEvent[0];

        const teamChannel = devOpsRequestedEvent.team.slackIdentity.teamChannel;

        const taskList = new TaskListMessage(`🚀 Provisioning of DevOps environment for team *${devOpsRequestedEvent.team.name}* started:`, new ChannelMessageClient(ctx).addDestination(teamChannel));
        taskList.addTask("OpenshiftEnv", "Create DevOps Openshift Project");
        taskList.addTask("OpenshiftPermissions", "Add Openshift Permissions");
        taskList.addTask("Resources", "Copy Subatomic resources to DevOps Project");
        taskList.addTask("Jenkins", "Rollout Jenkins instance");
        taskList.addTask("ConfigJenkins", "Configure Jenkins");

        try {
            const projectId = `${_.kebabCase(devOpsRequestedEvent.team.name).toLowerCase()}-devops`;
            logger.info(`Working with OpenShift project Id: ${projectId}`);

            await taskList.display();

            await this.ocService.login();

            await this.createDevOpsEnvironment(projectId, devOpsRequestedEvent.team.name);

            await taskList.setTaskStatus("OpenshiftEnv", TaskStatus.Successful);

            await this.ocService.addTeamMembershipPermissionsToProject(projectId,
                devOpsRequestedEvent.team);

            await taskList.setTaskStatus("OpenshiftPermissions", TaskStatus.Successful);

            await this.copySubatomicAppTemplatesToDevOpsEnvironment(projectId);

            await this.copyJenkinsTemplateToDevOpsEnvironment(projectId);

            await this.copyImageStreamsToDevOpsEnvironment(projectId);

            await taskList.setTaskStatus("Resources", TaskStatus.Successful);

            await this.createJenkinsDeploymentConfig(projectId);

            await this.createJenkinsServiceAccount(projectId);

            await this.rolloutJenkinsDeployment(projectId);

            await taskList.setTaskStatus("Jenkins", TaskStatus.Successful);

            const jenkinsHost: string = await this.createJenkinsRoute(projectId);

            const token: string = await this.getJenkinsServiceAccountToken(projectId);

            logger.info(`Using Service Account token: ${token}`);

            await this.addJenkinsCredentials(projectId, jenkinsHost, token);

            await this.addBitbucketSSHSecret(projectId);

            await taskList.setTaskStatus("ConfigJenkins", TaskStatus.Successful);

            return await this.sendDevOpsSuccessfullyProvisionedMessage(ctx, devOpsRequestedEvent.team.name, devOpsRequestedEvent.team.slackIdentity.teamChannel);
        } catch (error) {
            await taskList.failRemainingTasks();
            return await this.handleError(ctx, error, devOpsRequestedEvent.team.slackIdentity.teamChannel);
        }
    }

    private async createDevOpsEnvironment(projectId: string, teamName: string) {
        try {
            await this.ocService.newDevOpsProject(projectId, teamName);
        } catch (error) {
            logger.warn("DevOps project already seems to exist. Trying to continue.");
        }

        await this.ocService.createDevOpsDefaultResourceQuota(projectId);

        await this.ocService.createDevOpsDefaultLimits(projectId);
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

    private async copyJenkinsTemplateToDevOpsEnvironment(projectId: string) {
        const jenkinsTemplateJSON = await this.ocService.getJenkinsTemplate();

        const jenkinsTemplate: any = JSON.parse(jenkinsTemplateJSON.output);
        jenkinsTemplate.metadata.namespace = projectId;
        await this.ocService.createResourceFromDataInNamespace(jenkinsTemplate, projectId);
    }

    private async copyImageStreamsToDevOpsEnvironment(projectId) {
        const imageStreamTagsResult = await this.ocService.getSubatomicImageStreamTags();
        const imageStreamTags = JSON.parse(imageStreamTagsResult.output).items;

        for (const imageStreamTag of imageStreamTags) {
            const imageStreamTagName = imageStreamTag.metadata.name;
            await this.ocService.tagSubatomicImageToNamespace(imageStreamTagName, projectId);
        }
    }

    private async createJenkinsDeploymentConfig(projectId: string) {
        logger.info("Processing Jenkins QMTemplate...");
        const jenkinsTemplateResultJSON = await this.ocService.processJenkinsTemplateForDevOpsProject(projectId);
        logger.debug(`Processed Jenkins Template: ${jenkinsTemplateResultJSON.output}`);

        try {
            await this.ocService.getDeploymentConfigInNamespace("jenkins", projectId);
            logger.warn("Jenkins QMTemplate has already been processed, deployment exists");
        } catch (error) {
            await this.ocService.createResourceFromDataInNamespace(JSON.parse(jenkinsTemplateResultJSON.output), projectId);
        }
    }

    private async createJenkinsServiceAccount(projectId: string) {
        const serviceAccountDefinition = {
            apiVersion: "v1",
            kind: "ServiceAccount",
            metadata: {
                annotations: {
                    "subatomic.bison.co.za/managed": "true",
                    "serviceaccounts.openshift.io/oauth-redirectreference.jenkins": '{"kind":"OAuthRedirectReference", "apiVersion":"v1","reference":{"kind":"Route","name":"jenkins"}}',
                },
                name: "subatomic-jenkins",
            },
        };
        await this.ocService.createResourceFromDataInNamespace(serviceAccountDefinition, projectId);

        const roleBindingDefinition = {
            apiVersion: "rbac.authorization.k8s.io/v1beta1",
            kind: "RoleBinding",
            metadata: {
                annotations: {
                    "subatomic.bison.co.za/managed": "true",
                },
                name: "subatomic-jenkins-edit",
            },
            roleRef: {
                apiGroup: "rbac.authorization.k8s.io",
                kind: "ClusterRole",
                name: "admin",
            },
            subjects: [{
                kind: "ServiceAccount",
                name: "subatomic-jenkins",
            }],
        };

        await this.ocService.createResourceFromDataInNamespace(roleBindingDefinition, projectId, true);
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

    private async getJenkinsServiceAccountToken(projectId: string) {
        const tokenResult = await this.ocService.getServiceAccountToken("subatomic-jenkins", projectId);
        return tokenResult.output;
    }

    private async createJenkinsRoute(projectId: string): Promise<string> {

        await this.ocService.annotateJenkinsRoute(projectId);
        const jenkinsHost = await this.ocService.getJenkinsHost(projectId);

        return jenkinsHost.output;
    }

    private async addJenkinsCredentials(projectId: string, jenkinsHost: string, token: string) {
        logger.debug(`Using Jenkins Route host [${jenkinsHost}] to add Bitbucket credentials`);
        const bitbucketCredentials = {
            "": "0",
            "credentials": {
                scope: "GLOBAL",
                id: `${projectId}-bitbucket`,
                username: QMConfig.subatomic.bitbucket.auth.username,
                password: QMConfig.subatomic.bitbucket.auth.password,
                description: `${projectId}-bitbucket`,
                $class: "com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl",
            },
        };

        await this.createGlobalCredentialsFor("Bitbucket", jenkinsHost, token, projectId, bitbucketCredentials);

        const nexusCredentials = {
            "": "0",
            "credentials": {
                scope: "GLOBAL",
                id: "nexus-base-url",
                secret: `${QMConfig.subatomic.nexus.baseUrl}/content/repositories/`,
                description: "Nexus base URL",
                $class: "org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl",
            },
        };

        await this.createGlobalCredentialsFor("Nexus", jenkinsHost, token, projectId, nexusCredentials);

        const mavenCredentials = {
            "": "0",
            "credentials": {
                scope: "GLOBAL",
                id: "maven-settings",
                file: "file",
                fileName: "settings.xml",
                description: "Maven settings.xml",
                $class: "org.jenkinsci.plugins.plaincredentials.impl.FileCredentialsImpl",
            },
        };

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

    private async addBitbucketSSHSecret(projectId: string) {
        try {
            await this.ocService.getSecretFromNamespace("bitbucket-ssh", projectId);
            logger.warn("Bitbucket SSH secret must already exist");
        } catch (error) {
            await this.ocService.createBitbucketSSHAuthSecret("bitbucket-ssh", projectId);
        }
    }

    private async sendDevOpsSuccessfullyProvisionedMessage(ctx: HandlerContext, teamName: string, teamChannel: string): Promise<HandlerResult> {
        const msg: SlackMessage = {
            text: `Your DevOps environment has been provisioned successfully`,
            attachments: [{
                fallback: `Create a project`,
                footer: `For more information, please read the ${this.docs("create-project")}`,
                text: `
If you haven't already, you might want to create a Project for your team to work on.`,
                mrkdwn_in: ["text"],
                thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
                actions: [
                    buttonForCommand(
                        {text: "Create project"},
                        new CreateProject(),
                        {teamName}),
                ],
            }, {
                fallback: `Add a Subatomic Config Server`,
                footer: `For more information, please read the ${this.docs("add-config-server")}`,
                text: `
If your applications will require a Spring Cloud Config Server, you can add a Subatomic Config Server to your DevOps project now`,
                mrkdwn_in: ["text"],
                thumb_url: "https://docs.spring.io/spring-cloud-dataflow/docs/current-SNAPSHOT/reference/html/images/logo.png",
                actions: [
                    buttonForCommand(
                        {text: "Add Config Server"},
                        new AddConfigServer(),
                        {gluonTeamName: teamName}),
                ],
            }],
        };

        return await ctx.messageClient.addressChannels(msg, teamChannel);
    }

    private docs(extension): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#${extension}`,
            "documentation")}`;
    }

    private async handleError(ctx: HandlerContext, error, teamChannel: string) {
        return await handleQMError(new ChannelMessageClient(ctx).addDestination(teamChannel), error);
    }
}
