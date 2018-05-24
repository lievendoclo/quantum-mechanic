import {
    CommandHandler,
    failure,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    success,
    SuccessPromise,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {url} from "@atomist/slack-messages";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {SimpleOption} from "../../openshift/base/options/SimpleOption";
import {OCCommon} from "../../openshift/OCCommon";
import {QMTemplate} from "../../template/QMTemplate";
import {jenkinsAxios} from "../jenkins/Jenkins";
import {KickOffJenkinsBuild} from "../jenkins/JenkinsBuild";
import {getProjectId} from "../project/Project";
import {
    gluonProjectFromProjectName,
    gluonProjectsWhichBelongToGluonTeam,
    menuForProjects,
} from "../project/Projects";
import {logErrorAndReturnSuccess} from "../shared/Error";
import {createMenu} from "../shared/GenericMenu";
import {subatomicAppOpenshiftTemplates} from "../shared/SubatomicAppOpenshiftTemplates";
import {gluonTenantFromTenantId} from "../shared/Tenant";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo,
    menuForTeams,
} from "../team/Teams";
import {
    ApplicationType,
    gluonApplicationForNameAndProjectName,
    gluonApplicationsLinkedToGluonProject,
    menuForApplications,
} from "./Applications";

@CommandHandler("Configure an existing application/library", QMConfig.subatomic.commandPrefix + " configure component")
export class ConfigureComponent implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "application name",
        displayable: false,
        required: false,
    })
    public applicationName: string;

    @Parameter({
        description: "project name",
        displayable: false,
        required: false,
    })
    public projectName: string;

    @Parameter({
        description: "team name",
        displayable: false,
        required: false,
    })
    public teamName: string;

    @Parameter({
        description: "openshift template",
        displayable: false,
        required: false,
    })
    public openshiftTemplate: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {

        if (_.isEmpty(this.teamName) || _.isEmpty(this.projectName) || _.isEmpty(this.applicationName) || _.isEmpty(this.openshiftTemplate)) {
            return this.requestUnsetParameters(ctx);
        }
        // get memberId for createdBy
        return ctx.messageClient.addressChannels({
            text: "🚀 Your project component is being configured...",
        }, this.teamChannel)
            .then(() => {
                    return this.configureApplication(ctx).then(success);
                },
            );
    }

    private requestUnsetParameters(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
            return gluonTeamForSlackTeamChannel(this.teamChannel)
                .then(
                    team => {
                        this.teamName = team.name;
                        return this.requestUnsetParameters(ctx);
                    },
                    () => {
                        return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName).then(teams => {
                            return menuForTeams(
                                ctx,
                                teams,
                                this,
                                "Please select a team associated with the project you wish to configure the project component for");
                        });
                    },
                );
        }
        if (_.isEmpty(this.projectName)) {
            return gluonProjectsWhichBelongToGluonTeam(ctx, this.teamName)
                .then(projects => {
                    return menuForProjects(ctx, projects, this, "Please select the owning project of the component you wish to configure");
                });
        }
        if (_.isEmpty(this.applicationName)) {
            return gluonApplicationsLinkedToGluonProject(ctx, this.projectName).then(applications => {
                return menuForApplications(ctx, applications, this, "Please select the application/library describing the component you wish to configure");
            });
        }
        if (_.isEmpty(this.openshiftTemplate)) {
            const namespace = `${_.kebabCase(this.teamName).toLowerCase()}-devops`;
            return subatomicAppOpenshiftTemplates(namespace)
                .then(templates => {
                    return createMenu(ctx, templates.map(template => {
                            return {
                                value: template.metadata.name,
                                text: template.metadata.name,
                            };
                        }),
                        this,
                        "Please select the correct template for you component",
                        "Select a template",
                        "openshiftTemplate");
                });
        }
    }

    private configureApplication(ctx: HandlerContext): Promise<HandlerResult> {
        return gluonProjectFromProjectName(ctx, this.projectName)
            .then(project => {
                return gluonApplicationForNameAndProjectName(ctx, this.applicationName, this.projectName)
                    .then(application => {
                        return this.doConfiguration(
                            ctx,
                            project.name,
                            project.projectId,
                            application.name,
                            application.applicationType,
                            project.bitbucketProject.key,
                            application.bitbucketRepository.name,
                            application.bitbucketRepository.remoteUrl,
                            project.owningTeam.name,
                            project.teams,
                        );
                    }).catch(error => {
                        return logErrorAndReturnSuccess(gluonApplicationForNameAndProjectName.name, error);
                    });
            }).catch(error => {
                return logErrorAndReturnSuccess(gluonProjectFromProjectName.name, error);
            });
    }

    private doConfiguration(ctx: HandlerContext,
                            projectName: string,
                            projectId: string,
                            applicationName: string,
                            applicationType: string,
                            bitbucketProjectKey: string,
                            bitbucketRepoName: string,
                            bitbucketRepoRemoteUrl: string,
                            owningTeamName: string,
                            associatedTeams: any[]): Promise<HandlerResult> {

        const teamDevOpsProjectId = `${_.kebabCase(owningTeamName).toLowerCase()}-devops`;
        logger.debug(`Using owning team DevOps project: ${teamDevOpsProjectId}`);
        logger.debug(`Teams are: ${JSON.stringify(associatedTeams)}`);

        const jenkinsPromise: Promise<HandlerResult> = this.createJenkinsJob(
            teamDevOpsProjectId,
            projectName,
            projectId,
            applicationName,
            bitbucketProjectKey,
            bitbucketRepoName.toLowerCase(),
        );

        if (applicationType === ApplicationType.DEPLOYABLE.toString()) {
            return jenkinsPromise
                .then(() => {
                    const appBuildName = `${_.kebabCase(projectName).toLowerCase()}-${_.kebabCase(applicationName).toLowerCase()}`;
                    return OCCommon.createFromData({
                        apiVersion: "v1",
                        kind: "ImageStream",
                        metadata: {
                            name: appBuildName,
                        },
                    }, [
                        new SimpleOption("-namespace", teamDevOpsProjectId),
                    ])
                        .then(() => {
                            logger.info(`Using Git URI: ${bitbucketRepoRemoteUrl}`);

                            // TODO this should be extracted to a configurable QMTemplate
                            return OCCommon.createFromData({
                                    apiVersion: "v1",
                                    kind: "BuildConfig",
                                    metadata: {
                                        name: appBuildName,
                                    },
                                    spec: {
                                        source: {
                                            type: "Git",
                                            git: {
                                                // temporary hack because of the NodePort
                                                // TODO remove this!
                                                uri: `${bitbucketRepoRemoteUrl.replace("7999", "30999")}`,
                                                ref: "master",
                                            },
                                            sourceSecret: {
                                                // TODO should this be configurable?
                                                name: "bitbucket-ssh",
                                            },
                                        },
                                        strategy: {
                                            sourceStrategy: {
                                                from: {
                                                    kind: "ImageStreamTag",
                                                    name: "jdk8-maven3-newrelic-subatomic:2.0",
                                                },
                                            },
                                        },
                                        output: {
                                            to: {
                                                kind: "ImageStreamTag",
                                                name: `${appBuildName}:latest`,
                                            },
                                        },
                                    },
                                },
                                [
                                    new SimpleOption("-namespace", teamDevOpsProjectId),
                                ], true); // TODO clean up this hack - cannot be a boolean (magic)
                        })
                        .then(() => {
                            return gluonProjectFromProjectName(ctx, projectName).then(project => {
                                logger.info(`Trying to find tenant: ${project.owningTenant}`);
                                return gluonTenantFromTenantId(project.owningTenant).then(tenant => {
                                    logger.info(`Found tenant: ${tenant}`);
                                    return this.createApplicationOpenshiftResources(tenant.name, project.name, applicationName);
                                });
                            });

                        });
                })
                .then(() => {
                    return ctx.messageClient.addressChannels({
                        text: `Your application *${applicationName}*, in project *${projectName}*, has been provisioned successfully ` +
                        "and is ready to build and deploy to your project environments",
                        attachments: [{
                            fallback: `Your application has been provisioned successfully`,
                            footer: `For more information, please read the ${this.docs() + "#jenkins-build"}`,
                            text: `
You can kick off the build pipeline for your application by clicking the button below or pushing changes to your application's repository`,
                            mrkdwn_in: ["text"],
                            actions: [
                                buttonForCommand(
                                    {
                                        text: "Start build",
                                        style: "primary",
                                    },
                                    new KickOffJenkinsBuild(),
                                    {
                                        projectName,
                                        applicationName,
                                    }),
                            ],
                        }],
                    }, associatedTeams.map(team =>
                        team.slack.teamChannel));
                });
        } else {
            return jenkinsPromise
                .then(() => {
                        return ctx.messageClient.addressChannels({
                            text: "Your library has been provisioned successfully and is ready to build",
                            attachments: [{
                                fallback: `Your library has been provisioned successfully`,
                                footer: `For more information, please read the ${this.docs() + "#jenkins-build"}`,
                                text: `
You can kick off the build pipeline for your library by clicking the button below or pushing changes to your library's repository`,
                                mrkdwn_in: ["text"],
                                actions: [
                                    buttonForCommand(
                                        {
                                            text: "Start build",
                                            style: "primary",
                                        },
                                        new KickOffJenkinsBuild(),
                                        {
                                            projectName,
                                            applicationName,
                                        }),
                                ],
                            }],
                        }, associatedTeams.map(team =>
                            team.slack.teamChannel));
                    },
                );
        }

    }

    private createApplicationOpenshiftResources(tenantName: string, projectName: string, applicationName: string): Promise<any[]> {
        return Promise.all([["dev"],
            ["sit"],
            ["uat"]]
            .map(environment => {
                const projectId = getProjectId(tenantName, projectName, environment[0]);
                const appName = `${_.kebabCase(applicationName).toLowerCase()}`;
                logger.info(`Processing app [${appName}] Template for: ${projectId}`);

                return OCCommon.commonCommand("get", "templates",
                    [this.openshiftTemplate],
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
                    })
                    .then(() => {
                        return OCCommon.commonCommand("process",
                            this.openshiftTemplate,
                            [],
                            [
                                new SimpleOption("p", `APP_NAME=${appName}`),
                                new SimpleOption("p", `IMAGE_STREAM_PROJECT=${projectId}`),
                                new SimpleOption("-namespace", projectId),
                            ],
                        )
                            .then(appTemplate => {
                                logger.debug(`Processed app [${appName}] Template: ${appTemplate.output}`);

                                return OCCommon.commonCommand("get", `dc/${appName}`, [],
                                    [
                                        new SimpleOption("-namespace", projectId),
                                    ])
                                    .then(() => {
                                        logger.warn(`App [${appName}] Template has already been processed, deployment exists`);
                                        return SuccessPromise;
                                    }, () => {
                                        return OCCommon.createFromData(JSON.parse(appTemplate.output),
                                            [
                                                new SimpleOption("-namespace", projectId),
                                            ]);
                                    });
                            });
                    });
            }));
    }

    private createJenkinsJob(teamDevOpsProjectId: string,
                             gluonProjectName: string,
                             gluonProjectId: string,
                             gluonApplicationName: string,
                             bitbucketProjectKey: string,
                             bitbucketRepositoryName: string): Promise<HandlerResult> {
        return OCCommon.commonCommand("serviceaccounts",
            "get-token",
            [
                "subatomic-jenkins",
            ], [
                new SimpleOption("-namespace", teamDevOpsProjectId),
            ])
            .then(token => {
                return OCCommon.commonCommand(
                    "get",
                    "route/jenkins",
                    [],
                    [
                        new SimpleOption("-output", "jsonpath={.spec.host}"),
                        new SimpleOption("-namespace", teamDevOpsProjectId),
                    ])
                    .then(jenkinsHost => {
                        logger.debug(`Using Jenkins Route host [${jenkinsHost.output}] to add Bitbucket credentials`);

                        const jenkinsTemplate: QMTemplate = new QMTemplate("templates/jenkins/jenkins-multi-branch-project.xml");
                        const builtTemplate: string = jenkinsTemplate.build(
                            {
                                gluonApplicationName,
                                gluonBaseUrl: QMConfig.subatomic.gluon.baseUrl,
                                gluonProjectId,
                                bitbucketBaseUrl: QMConfig.subatomic.bitbucket.baseUrl,
                                teamDevOpsProjectId,
                                bitbucketProjectKey,
                                bitbucketRepositoryName,
                            },
                        );
                        const axios = jenkinsAxios();
                        return axios.post(`https://${jenkinsHost.output}/job/${_.kebabCase(gluonProjectName).toLowerCase()}/createItem?name=${_.kebabCase(gluonApplicationName).toLowerCase()}`,
                            builtTemplate,
                            {
                                headers: {
                                    "Content-Type": "application/xml",
                                    "Authorization": `Bearer ${token.output}`,
                                },
                            })
                            .then(success, error => {
                                if (error.response && error.response.status === 400) {
                                    logger.warn(`Multibranch job for [${gluonApplicationName}] probably already created`);
                                    return SuccessPromise;
                                } else {
                                    return failure(error);
                                }
                            });
                    });
            });
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference`,
            "documentation")}`;
    }
}
