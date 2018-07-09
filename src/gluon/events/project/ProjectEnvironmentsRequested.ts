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
import {QMConfig} from "../../../config/QMConfig";
import {OCCommandResult} from "../../../openshift/base/OCCommandResult";
import {QMTemplate} from "../../../template/QMTemplate";
import {LinkExistingApplication} from "../../commands/packages/CreateApplication";
import {LinkExistingLibrary} from "../../commands/packages/CreateLibrary";
import {JenkinsService} from "../../util/jenkins/Jenkins";
import {OCService} from "../../util/openshift/OCService";
import {getProjectId} from "../../util/project/Project";
import {
    ChannelMessageClient,
    handleQMError,
    OCResultError,
    QMError,
    QMMessageClient,
} from "../../util/shared/Error";
import {isSuccessCode} from "../../util/shared/Http";
import {TaskListMessage, TaskStatus} from "../../util/shared/TaskListMessage";

@EventHandler("Receive ProjectEnvironmentsRequestedEvent events", `
subscription ProjectEnvironmentsRequestedEvent {
  ProjectEnvironmentsRequestedEvent {
    id
    project {
      projectId
      name
      description
    }
    teams {
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
    owningTenant {
      tenantId,
      name,
      description
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
export class ProjectEnvironmentsRequested implements HandleEvent<any> {

    private qmMessageClient: ChannelMessageClient;
    private taskList: TaskListMessage;

    constructor(private jenkinsService = new JenkinsService(),
                private ocService = new OCService()) {
    }

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested ProjectEnvironmentsRequestedEvent event: ${JSON.stringify(event.data)}`);

        const environmentsRequestedEvent = event.data.ProjectEnvironmentsRequestedEvent[0];

        this.qmMessageClient = this.createMessageClient(ctx, environmentsRequestedEvent.teams);

        this.taskList = this.initialiseTaskList(environmentsRequestedEvent.project.name, this.qmMessageClient);
        await this.taskList.display();

        try {
            const teamDevOpsProjectId = `${_.kebabCase(environmentsRequestedEvent.teams[0].name).toLowerCase()}-devops`;

            await this.createOpenshiftEnvironments(environmentsRequestedEvent, teamDevOpsProjectId);

            logger.debug(`Using owning team DevOps project: ${teamDevOpsProjectId}`);

            const token = await this.ocService.getServiceAccountToken("subatomic-jenkins", teamDevOpsProjectId);
            const jenkinsHost = await this.ocService.getJenkinsHost(teamDevOpsProjectId);

            logger.debug(`Using Jenkins Route host [${jenkinsHost.output}] to add Bitbucket credentials`);

            await this.createJenkinsBuildTemplate(environmentsRequestedEvent, teamDevOpsProjectId, jenkinsHost.output, token.output);

            await this.createJenkinsCredentials(teamDevOpsProjectId, jenkinsHost.output, token.output);

            await this.taskList.setTaskStatus(`ConfigJenkins`, TaskStatus.Successful);

            await this.createPodNetwork(environmentsRequestedEvent.teams[0].name, environmentsRequestedEvent.owningTenant.name, environmentsRequestedEvent.project.name);

            await this.taskList.setTaskStatus(`PodNetwork`, TaskStatus.Successful);

            return await this.sendPackageUsageMessage(ctx, environmentsRequestedEvent.project.name, environmentsRequestedEvent.teams);
        } catch (error) {
            await this.taskList.failRemainingTasks();
            return await handleQMError(this.qmMessageClient, error);
        }
    }

    private createMessageClient(ctx: HandlerContext, teams) {
        const messageClient = new ChannelMessageClient(ctx);
        teams.map(team => {
            messageClient.addDestination(team.slackIdentity.teamChannel);
        });
        return messageClient;
    }

    private initialiseTaskList(projectName: string, messageClient: QMMessageClient) {
        const taskList = new TaskListMessage(`🚀 Provisioning of environment's for project *${projectName}* started:`, messageClient);
        taskList.addTask("devEnvironment", "Create Dev Environment");
        taskList.addTask("sitEnvironment", "Create SIT Environment");
        taskList.addTask("uatEnvironment", "Create UAT Environment");
        taskList.addTask("ConfigJenkins", "Configure Jenkins");
        taskList.addTask("PodNetwork", "Create project/devops pod network");
        return taskList;
    }

    private async createOpenshiftEnvironments(environmentsRequestedEvent, teamDevOpsProjectId: string) {
        const environments = [["dev", "Development"],
            ["sit", "Integration testing"],
            ["uat", "User acceptance"]];

        await this.ocService.login();

        for (const environment of environments) {
            const projectId = getProjectId(environmentsRequestedEvent.owningTenant.name, environmentsRequestedEvent.project.name, environment[0]);
            logger.info(`Working with OpenShift project Id: ${projectId}`);

            await this.createOpenshiftProject(projectId, environmentsRequestedEvent, environment);
            await this.addEditRoleToJenkinsServiceAccount(teamDevOpsProjectId, projectId);
            await this.taskList.setTaskStatus(`${environment[0]}Environment`, TaskStatus.Successful);
        }
    }

    private async addEditRoleToJenkinsServiceAccount(teamDevOpsProjectId: string, projectId: string) {
        return await this.ocService.addRoleToUserInNamespace(
            `system:serviceaccount:${teamDevOpsProjectId}:jenkins`,
            "edit",
            projectId);
    }

    private async createJenkinsBuildTemplate(environmentsRequestedEvent, teamDevOpsProjectId: string, jenkinsHost: string, token: string) {
        const projectTemplate: QMTemplate = new QMTemplate("resources/templates/jenkins/jenkins-openshift-environment-credentials.xml");
        const builtTemplate: string = projectTemplate.build(
            {
                projectName: environmentsRequestedEvent.project.name,
                docsUrl: QMConfig.subatomic.docs.baseUrl,
                teamDevOpsProjectId,
                devProjectId: getProjectId(environmentsRequestedEvent.owningTenant.name, environmentsRequestedEvent.project.name, "dev"),
                sitProjectId: getProjectId(environmentsRequestedEvent.owningTenant.name, environmentsRequestedEvent.project.name, "sit"),
                uatProjectId: getProjectId(environmentsRequestedEvent.owningTenant.name, environmentsRequestedEvent.project.name, "uat"),
            },
        );
        logger.info("Template found and built successfully.");
        const jenkinsCreateItemResult = await this.jenkinsService.createOpenshiftEnvironmentCredentials(jenkinsHost, token, environmentsRequestedEvent.project.name, builtTemplate);

        if (!isSuccessCode(jenkinsCreateItemResult.status)) {
            if (jenkinsCreateItemResult.status === 400) {
                logger.warn(`Folder for [${environmentsRequestedEvent.project.name}] probably already created`);
            } else {
                throw new QMError("Failed to create jenkins build template. Network timeout occurred.");
            }
        }
    }

    private async createOpenshiftProject(projectId: string, environmentsRequestedEvent, environment) {
        try {
            return await this.ocService.newSubatomicProject(
                projectId,
                environmentsRequestedEvent.project.name,
                environmentsRequestedEvent.owningTenant.name,
                environment);
        } catch (err) {
            logger.warn(err);
        } finally {
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

    private async createJenkinsCredentials(teamDevOpsProjectId: string, jenkinsHost: string, token: string) {
        const jenkinsCredentials = {
            "": "0",
            "credentials": {
                scope: "GLOBAL",
                id: `${teamDevOpsProjectId}-bitbucket`,
                username: QMConfig.subatomic.bitbucket.auth.username,
                password: QMConfig.subatomic.bitbucket.auth.password,
                description: `${teamDevOpsProjectId}-bitbucket`,
                $class: "com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl",
            },
        };
        const createCredentialsResult = await this.jenkinsService.createGlobalCredentials(jenkinsHost, token, teamDevOpsProjectId, jenkinsCredentials);

        if (!isSuccessCode(createCredentialsResult.status)) {
            throw new QMError("Failed to create Jenkins credentials for project");
        }
    }

    private async createPodNetwork(teamName: string, tenantName: string, projectName: string) {
        const teamDevOpsProjectId = `${_.kebabCase(teamName).toLowerCase()}-devops`;
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

    private async sendPackageUsageMessage(ctx: HandlerContext, projectName: string, teams) {
        const msg: SlackMessage = {
            text: `
Since you have Subatomic project environments ready, you can now add packages.
A package is either an application or a library, click the button below to create an application now.`,
            attachments: [{
                fallback: "Create or link existing package",
                footer: `For more information, please read the ${this.docs()}`,
                color: "#45B254",
                thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
                actions: [
                    buttonForCommand(
                        {text: "Link existing application"},
                        new LinkExistingApplication(),
                        {
                            projectName,
                        }),
                    buttonForCommand(
                        {text: "Link existing library"},
                        new LinkExistingLibrary(),
                        {
                            projectName,
                        }),
                ],
            }],
        };

        return ctx.messageClient.addressChannels(msg,
            teams.map(team =>
                team.slackIdentity.teamChannel));
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#link-library`,
            "documentation")}`;
    }
}
