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
import {QMConfig} from "../../config/QMConfig";
import {SimpleOption} from "../../openshift/base/options/SimpleOption";
import {OCClient} from "../../openshift/OCClient";
import {OCCommon} from "../../openshift/OCCommon";
import {
    createGlobalCredentials,
    createGlobalCredentialsWithFile,
} from "../jenkins/Jenkins";
import {AddConfigServer} from "../project/AddConfigServer";
import {CreateProject} from "../project/CreateProject";
import {ChannelMessageClient, handleQMError, QMError} from "../shared/Error";
import {isSuccessCode} from "../shared/Http";
import {subatomicImageStreamTags} from "../shared/SubatomicOpenshiftQueries";
import {TaskListMessage, TaskStatus} from "../shared/TaskListMessage";

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

            await OCClient.login(QMConfig.subatomic.openshift.masterUrl, QMConfig.subatomic.openshift.auth.token);

            await this.createDevOpsEnvironment(projectId, devOpsRequestedEvent.team.name);

            await taskList.setTaskStatus("OpenshiftEnv", TaskStatus.Successful);

            await addOpenshiftMembershipPermissions(projectId,
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
            await OCClient.newProject(projectId,
                `${teamName} DevOps`,
                `DevOps environment for ${teamName} [managed by Subatomic]`);
        } catch (error) {
            logger.warn("DevOps project already seems to exist. Trying to continue.");
        }

        await OCCommon.createFromData({
            apiVersion: "v1",
            kind: "ResourceQuota",
            metadata: {
                name: "default-quota",
            },
            spec: {
                hard: {
                    "limits.cpu": "16", // 4 * 4m
                    "limits.memory": "4096Mi", // 4 * 1024Mi
                    "pods": "4",
                },
            },
        }, [
            new SimpleOption("-namespace", projectId),
        ]);

        await OCCommon.createFromData({
            apiVersion: "v1",
            kind: "LimitRange",
            metadata: {
                name: "default-limits",
            },
            spec: {
                limits: [{
                    type: "Container",
                    max: {
                        cpu: "4",
                        memory: "1024Mi",
                    },
                    default: {
                        cpu: "4",
                        memory: "1024Mi",
                    },
                    defaultRequest: {
                        cpu: "0",
                        memory: "0Mi",
                    },
                }],
            },
        }, [
            new SimpleOption("-namespace", projectId),
        ]);
    }

    private async copySubatomicAppTemplatesToDevOpsEnvironment(projectId: string) {
        logger.info(`Finding templates in subatomic namespace`);

        const appTemplatesJSON = await OCCommon.commonCommand("get", "templates",
            [],
            [
                new SimpleOption("l", "usage=subatomic-app"),
                new SimpleOption("-namespace", "subatomic"),
                new SimpleOption("-output", "json"),
            ],
        );

        const appTemplates: any = JSON.parse(appTemplatesJSON.output);
        for (const item of appTemplates.items) {
            item.metadata.namespace = projectId;
        }
        await OCCommon.createFromData(appTemplates,
            [
                new SimpleOption("-namespace", projectId),
            ]
            , );
    }

    private async copyJenkinsTemplateToDevOpsEnvironment(projectId: string) {
        const jenkinsTemplateJSON = await OCCommon.commonCommand("get", "templates",
            ["jenkins-persistent-subatomic"],
            [
                new SimpleOption("-namespace", "subatomic"),
                new SimpleOption("-output", "json"),
            ],
        );

        const jenkinsTemplate: any = JSON.parse(jenkinsTemplateJSON.output);
        jenkinsTemplate.metadata.namespace = projectId;
        await OCCommon.createFromData(jenkinsTemplate,
            [
                new SimpleOption("-namespace", projectId),
            ]
            , );
    }

    private async copyImageStreamsToDevOpsEnvironment(projectId) {
        const imageStreamTags = await subatomicImageStreamTags("subatomic");

        for (const imageStreamTag of imageStreamTags) {
            const imageStreamTagName = imageStreamTag.metadata.name;
            await OCCommon.commonCommand("tag",
                `subatomic/${imageStreamTagName}`,
                [`${projectId}/${imageStreamTagName}`]);
        }
    }

    private async createJenkinsDeploymentConfig(projectId: string) {
        logger.info("Processing Jenkins QMTemplate...");
        const jenkinsTemplateResultJSON = await OCCommon.commonCommand("process",
            "jenkins-persistent-subatomic",
            [],
            [
                new SimpleOption("p", `NAMESPACE=${projectId}`),
                new SimpleOption("p", "JENKINS_IMAGE_STREAM_TAG=jenkins-subatomic:2.0"),
                new SimpleOption("p", "BITBUCKET_NAME=Subatomic Bitbucket"),
                new SimpleOption("p", `BITBUCKET_URL=${QMConfig.subatomic.bitbucket.baseUrl}`),
                new SimpleOption("p", `BITBUCKET_CREDENTIALS_ID=${projectId}-bitbucket`),
                // TODO this should be a property on Team. I.e. teamEmail
                // If no team email then the address of the createdBy member
                new SimpleOption("p", "JENKINS_ADMIN_EMAIL=subatomic@local"),
                // TODO the registry Cluster IP we will have to get by introspecting the registry Service
                new SimpleOption("p", `MAVEN_SLAVE_IMAGE=${QMConfig.subatomic.openshift.dockerRepoUrl}/${projectId}/jenkins-slave-maven-subatomic:2.0`),
                new SimpleOption("p", `NODEJS_SLAVE_IMAGE=${QMConfig.subatomic.openshift.dockerRepoUrl}/${projectId}/jenkins-slave-nodejs-subatomic:2.0`),
                new SimpleOption("-namespace", projectId),
            ],
        );
        logger.debug(`Processed Jenkins Template: ${jenkinsTemplateResultJSON.output}`);

        try {
            await OCCommon.commonCommand("get", "dc/jenkins", [],
                [
                    new SimpleOption("-namespace", projectId),
                ]);
            logger.warn("Jenkins QMTemplate has already been processed, deployment exists");
        } catch (error) {
            await OCCommon.createFromData(JSON.parse(jenkinsTemplateResultJSON.output),
                [
                    new SimpleOption("-namespace", projectId),
                ]);
        }
    }

    private async createJenkinsServiceAccount(projectId: string) {
        await OCCommon.createFromData({
            apiVersion: "v1",
            kind: "ServiceAccount",
            metadata: {
                annotations: {
                    "subatomic.bison.co.za/managed": "true",
                    "serviceaccounts.openshift.io/oauth-redirectreference.jenkins": '{"kind":"OAuthRedirectReference", "apiVersion":"v1","reference":{"kind":"Route","name":"jenkins"}}',
                },
                name: "subatomic-jenkins",
            },
        }, [
            new SimpleOption("-namespace", projectId),
        ]);

        await OCCommon.createFromData({
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
        }, [
            new SimpleOption("-namespace", projectId),
        ], true);
    }

    private async rolloutJenkinsDeployment(projectId) {
        await promiseRetry((retryFunction, attemptCount: number) => {
            logger.debug(`Jenkins rollout status check attempt number ${attemptCount}`);

            return OCCommon.commonCommand(
                "rollout status",
                "dc/jenkins",
                [],
                [
                    new SimpleOption("-namespace", projectId),
                    new SimpleOption("-watch=false"),
                ], true)
                .then(rolloutStatus => {
                    logger.debug(JSON.stringify(rolloutStatus.output));

                    if (rolloutStatus.output.indexOf("successfully rolled out") === -1) {
                        retryFunction();
                    }
                });
        }, {
            // Retry for up to 3 mins
            factor: 1,
            retries: 19,
            minTimeout: 20000,
        });
    }

    private async getJenkinsServiceAccountToken(projectId: string) {
        const tokenResult = await OCCommon.commonCommand("serviceaccounts",
            "get-token",
            [
                "subatomic-jenkins",
            ], [
                new SimpleOption("-namespace", projectId),
            ]);
        return tokenResult.output;
    }

    private async createJenkinsRoute(projectId: string): Promise<string> {
        await OCCommon.commonCommand("annotate route",
            "jenkins",
            [],
            [
                new SimpleOption("-overwrite", "haproxy.router.openshift.io/timeout=120s"),
                new SimpleOption("-namespace", projectId),
            ]);
        const jenkinsHost = await OCCommon.commonCommand(
            "get",
            "route/jenkins",
            [],
            [
                new SimpleOption("-output", "jsonpath={.spec.host}"),
                new SimpleOption("-namespace", projectId),
            ]);

        return jenkinsHost.output;
    }

    private async addJenkinsCredentials(projectId: string, jenkinsHost: string, token: string) {
        logger.debug(`Using Jenkins Route host [${jenkinsHost}] to add Bitbucket credentials`);
        const createBitbucketGlobalCredentialsResult = await createGlobalCredentials(
            jenkinsHost,
            token,
            projectId,
            {
                "": "0",
                "credentials": {
                    scope: "GLOBAL",
                    id: `${projectId}-bitbucket`,
                    username: QMConfig.subatomic.bitbucket.auth.username,
                    password: QMConfig.subatomic.bitbucket.auth.password,
                    description: `${projectId}-bitbucket`,
                    $class: "com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl",
                },
            });

        if (!isSuccessCode(createBitbucketGlobalCredentialsResult.status)) {
            throw new QMError("Failed to created Bitbucket Global Credentials in Jenkins");
        }

        const createNexusGlobalCredentialsResult = await createGlobalCredentials(
            jenkinsHost,
            token,
            projectId,
            {
                "": "0",
                "credentials": {
                    scope: "GLOBAL",
                    id: "nexus-base-url",
                    secret: `${QMConfig.subatomic.nexus.baseUrl}/content/repositories/`,
                    description: "Nexus base URL",
                    $class: "org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl",
                },
            });

        if (!isSuccessCode(createNexusGlobalCredentialsResult.status)) {
            throw new QMError("Failed to create Nexus Global Credentials in Jenkins");
        }

        const createMavenGlobalCredentialsResult = await createGlobalCredentialsWithFile(
            jenkinsHost,
            token,
            projectId,
            {
                "": "0",
                "credentials": {
                    scope: "GLOBAL",
                    id: "maven-settings",
                    file: "file",
                    fileName: "settings.xml",
                    description: "Maven settings.xml",
                    $class: "org.jenkinsci.plugins.plaincredentials.impl.FileCredentialsImpl",
                },
            },
            QMConfig.subatomic.maven.settingsPath,
            "settings.xml");

        if (!isSuccessCode(createMavenGlobalCredentialsResult.status)) {
            throw new QMError("Failed to create Maven Global Credentials in Jenkins");
        }
    }

    private async addBitbucketSSHSecret(projectId: string) {
        try {
            await OCCommon.commonCommand("get secrets",
                "bitbucket-ssh",
                [],
                [
                    new SimpleOption("-namespace", projectId),
                ]);
            logger.warn("Bitbucket SSH secret must already exist");
        } catch (error) {
            await OCCommon.commonCommand("secrets new-sshauth",
                "bitbucket-ssh",
                [],
                [
                    new SimpleOption("-ssh-privatekey", QMConfig.subatomic.bitbucket.cicdPrivateKeyPath),
                    new SimpleOption("-ca-cert", QMConfig.subatomic.bitbucket.caPath),
                    new SimpleOption("-namespace", projectId),
                ]);
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

export async function addOpenshiftMembershipPermissions(projectId: string, team: { owners: Array<{ domainUsername }>, members: Array<{ domainUsername }> }) {
    await team.owners.map(async owner => {
        const ownerUsername = /[^\\]*$/.exec(owner.domainUsername)[0];
        logger.info(`Adding role to project [${projectId}] and owner [${owner.domainUsername}]: ${ownerUsername}`);
        return await OCClient.policy.addRoleToUser(ownerUsername,
            "admin",
            projectId);
    });
    await team.members.map(async member => {
        const memberUsername = /[^\\]*$/.exec(member.domainUsername)[0];
        await logger.info(`Adding role to project [${projectId}] and member [${member.domainUsername}]: ${memberUsername}`);
        return await OCClient.policy.addRoleToUser(memberUsername,
            "view",
            projectId);
    });
}
