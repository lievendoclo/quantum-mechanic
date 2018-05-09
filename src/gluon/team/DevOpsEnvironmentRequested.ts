import {
    EventFired,
    EventHandler,
    failure,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    SuccessPromise,
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

    public handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested DevOpsEnvironmentRequestedEvent event: ${JSON.stringify(event.data)}`);

        const devOpsRequestedEvent = event.data.DevOpsEnvironmentRequestedEvent[0];

        const projectId = `${_.kebabCase(devOpsRequestedEvent.team.name).toLowerCase()}-devops`;
        logger.info(`Working with OpenShift project Id: ${projectId}`);

        return OCClient.login(QMConfig.subatomic.openshift.masterUrl, QMConfig.subatomic.openshift.auth.token)
            .then(() => {
                return OCClient.newProject(projectId,
                    `${devOpsRequestedEvent.team.name} DevOps`,
                    `DevOps environment for ${devOpsRequestedEvent.team.name} [managed by Subatomic]`);
            })
            .then(() => {
                return addOpenshiftMembershipPermissions(projectId,
                    devOpsRequestedEvent.team);
            }, err => {
                logger.warn(err);
                // TODO what do we do with existing projects?
                // We should probably make sure the name, display name etc. is consistent

                return addOpenshiftMembershipPermissions(projectId,
                    devOpsRequestedEvent.team);
            })
            .then(() => {
                // 3. Ensure quotas are set per project
                return OCCommon.createFromData({
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
                            "replicationcontrollers": "4",
                            "services": "4",
                        },
                    },
                }, [
                    new SimpleOption("-namespace", projectId),
                ])
                    .then(() => {
                        return OCCommon.createFromData({
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
                    });
            })
            .then(() => {
                return OCCommon.commonCommand("get", "templates",
                    ["jenkins-persistent-subatomic"],
                    [
                        new SimpleOption("-namespace", "subatomic"),
                        new SimpleOption("-output", "json"),
                    ],
                )
                    .then(template => {
                        const appTemplate: any = JSON.parse(template.output);
                        appTemplate.metadata.namespace = projectId;
                        return OCCommon.createFromData(appTemplate,
                            [
                                new SimpleOption("-namespace", projectId),
                            ]
                            , );
                    });
            }).then(() => {
                return Promise.all([OCCommon.commonCommand("tag",
                    // TODO Fix: abusing the commonCommand here a bit...
                    "subatomic/jenkins-subatomic:2.0",
                    [`${projectId}/jenkins-subatomic:2.0`],
                ), OCCommon.commonCommand("tag",
                    "subatomic/jenkins-slave-maven-subatomic:2.0",
                    [`${projectId}/jenkins-slave-maven-subatomic:2.0`],
                ), OCCommon.commonCommand("tag",
                    "subatomic/jdk8-maven3-newrelic-subatomic:2.0",
                    [`${projectId}/jdk8-maven3-newrelic-subatomic:2.0`],
                )]);
            })
            .then(() => {
                logger.info("Processing Jenkins Template...");
                return OCCommon.commonCommand("process",
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
                        new SimpleOption("-namespace", projectId),
                    ],
                )
                    .then(jenkinsTemplate => {
                        logger.debug(`Processed Jenkins Template: ${jenkinsTemplate.output}`);

                        return OCCommon.commonCommand("get", "dc/jenkins", [],
                            [
                                new SimpleOption("-namespace", projectId),
                            ])
                            .then(() => {
                                logger.warn("Jenkins Template has already been processed, deployment exists");
                                return SuccessPromise;
                            }, () => {
                                return OCCommon.createFromData(JSON.parse(jenkinsTemplate.output),
                                    [
                                        new SimpleOption("-namespace", projectId),
                                    ]);
                            });
                    });
            })
            .then(() => {
                return OCCommon.createFromData({
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
                ])
                    .then(() => {
                        return OCCommon.createFromData({
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
                    })
                    .then(() => {
                        return OCCommon.commonCommand("serviceaccounts",
                            "get-token",
                            [
                                "subatomic-jenkins",
                            ], [
                                new SimpleOption("-namespace", projectId),
                            ]);
                    })
                    .then(token => {
                        logger.info(`Using Service Account token: ${token.output}`);

                        return promiseRetry((retryFunction, attemptCount: number) => {
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
                            retries: 9,
                            minTimeout: 20000,
                        })
                            .then(() => {
                                return OCCommon.commonCommand("annotate route",
                                    "jenkins",
                                    [],
                                    [
                                        new SimpleOption("-overwrite", "haproxy.router.openshift.io/timeout=120s"),
                                        new SimpleOption("-namespace", projectId),
                                    ]);
                            })
                            .then(() => {
                                return OCCommon.commonCommand(
                                    "get",
                                    "route/jenkins",
                                    [],
                                    [
                                        new SimpleOption("-output", "jsonpath={.spec.host}"),
                                        new SimpleOption("-namespace", projectId),
                                    ])
                                    .then(jenkinsHost => {
                                        logger.debug(`Using Jenkins Route host [${jenkinsHost.output}] to add Bitbucket credentials`);

                                        return createGlobalCredentials(
                                            jenkinsHost.output,
                                            token.output,
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
                                            })
                                            .then(() => {
                                                return createGlobalCredentials(
                                                    jenkinsHost.output,
                                                    token.output,
                                                    projectId,
                                                    {
                                                        "": "0",
                                                        "credentials": {
                                                            scope: "GLOBAL",
                                                            id: "nexus-base-url",
                                                            secret: QMConfig.subatomic.nexus.baseUrl,
                                                            description: "Nexus base URL",
                                                            $class: "org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl",
                                                        },
                                                    })
                                                    .then(() => {
                                                        return createGlobalCredentialsWithFile(
                                                            jenkinsHost.output,
                                                            token.output,
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
                                                    });
                                            });
                                    });
                            })
                            .catch(err => {
                                if (err instanceof TimeoutError) {
                                    logger.error(`Waiting for dc/jenkins deployment timed out`);
                                } else {
                                    failure(err);
                                }
                            });
                    })
                    .then(() => {
                        return OCCommon.commonCommand("get secrets",
                            "bitbucket-ssh",
                            [],
                            [
                                new SimpleOption("-namespace", projectId),
                            ])
                            .then(() => {
                                logger.warn("Bitbucket SSH secret must already exist");
                                return SuccessPromise;
                            }, () => {
                                return OCCommon.commonCommand("secrets new-sshauth",
                                    "bitbucket-ssh",
                                    [],
                                    [
                                        new SimpleOption("-ssh-privatekey", QMConfig.subatomic.bitbucket.cicdPrivateKeyPath),
                                        new SimpleOption("-ca-cert", QMConfig.subatomic.bitbucket.caPath),
                                        new SimpleOption("-namespace", projectId),
                                    ]);
                            });
                    });
            })
            .then(() => {
                const msg: SlackMessage = {
                    text: `Your DevOps environment has been provisioned successfully`,
                    attachments: [{
                        fallback: `Create a project`,
                        footer: `For more information, please read the ${this.docs() + "#create-project"}`,
                        text: `
If you haven't already, you might want to create a Project for your team to work on.`,
                        mrkdwn_in: ["text"],
                        thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
                        actions: [
                            buttonForCommand(
                                {text: "Create project"},
                                new CreateProject(),
                                {teamName: devOpsRequestedEvent.team.teamId}),
                        ],
                    }, {
                        fallback: `Add a Subatomic Config Server`,
                        footer: `For more information, please read the ${this.docs() + "#add-config-server"}`,
                        text: `
If your applications will require a Spring Cloud Config Server, you can add a Subatomic Config Server to your DevOps project now`,
                        mrkdwn_in: ["text"],
                        thumb_url: "https://docs.spring.io/spring-cloud-dataflow/docs/current-SNAPSHOT/reference/html/images/logo.png",
                        actions: [
                            buttonForCommand(
                                {text: "Add Config Server"},
                                new AddConfigServer(),
                                {gluonTeamName: devOpsRequestedEvent.team.teamId}),
                        ],
                    }],
                };

                return ctx.messageClient.addressChannels(msg, devOpsRequestedEvent.team.slackIdentity.teamChannel);
            })
            .catch(err => {
                return failure(err);
            });
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference`,
            "documentation")}`;
    }
}

export function addOpenshiftMembershipPermissions(projectId: string, team: { owners: Array<{ domainUsername }>, members: Array<{ domainUsername }> }): Promise<any> {
    return Promise.all(
        team.owners.map(owner => {
            const ownerUsername = /[^\\]*$/.exec(owner.domainUsername)[0];
            logger.info(`Adding role to project [${projectId}] and owner [${owner.domainUsername}]: ${ownerUsername}`);
            return OCClient.policy.addRoleToUser(ownerUsername,
                "admin",
                projectId);
        }))
        .then(() => {
            return Promise.all(
                team.members.map(member => {
                    const memberUsername = /[^\\]*$/.exec(member.domainUsername)[0];
                    logger.info(`Adding role to project [${projectId}] and member [${member.domainUsername}]: ${memberUsername}`);
                    return OCClient.policy.addRoleToUser(memberUsername,
                        "view",
                        projectId);
                }));
        });
}
