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
} from "@atomist/automation-client";
import {menuForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {SimpleOption} from "../../openshift/base/options/SimpleOption";
import {OCCommon} from "../../openshift/OCCommon";
import {gluonApplicationsLinkedToGluonProject} from "../packages/Applications";
import {gluonProjectsWhichBelongToGluonTeam} from "../project/Projects";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo,
} from "../team/Teams";
import {kickOffBuild, kickOffFirstBuild} from "./Jenkins";

@CommandHandler("Kick off a Jenkins build", QMConfig.subatomic.commandPrefix + " jenkins build")
export class KickOffJenkinsBuild implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUser)
    public slackName: string;

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "team name",
        required: false,
        displayable: false,
    })
    public teamName: string;

    @Parameter({
        description: "project name",
        required: false,
        displayable: false,
    })
    public projectName: string;

    @Parameter({
        description: "application name",
        required: false,
        displayable: false,
    })
    public applicationName: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        return gluonTeamForSlackTeamChannel(this.teamChannel)
            .then(team => {
                return this.projectsForGluonTeam(ctx,
                    this.applicationName,
                    this.projectName,
                    team.name);
            }, () => {
                if (!_.isEmpty(this.teamName)) {
                    return this.projectsForGluonTeam(ctx,
                        this.applicationName,
                        this.projectName,
                        this.teamName);
                } else {
                    return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName)
                        .then(teams => {
                            return ctx.messageClient.respond({
                                text: "Please select a team linked to a project with the application you want to build",
                                attachments: [{
                                    fallback: "Please select a team linked to a project with the application you want to build",
                                    actions: [
                                        menuForCommand({
                                                text: "Select Team", options:
                                                    teams.map(team => {
                                                        return {
                                                            value: team.name,
                                                            text: team.name,
                                                        };
                                                    }),
                                            },
                                            this, "teamName"),
                                    ],
                                }],
                            });
                        });
                }
            });
    }

    private projectsForGluonTeam(ctx: HandlerContext,
                                 gluonApplicationName: string,
                                 gluonProjectName: string,
                                 gluonTeamName: string): Promise<HandlerResult> {
        if (!_.isEmpty(gluonProjectName)) {
            logger.debug(`Using Gluon project: ${gluonProjectName}`);

            return this.applicationsForGluonProject(ctx,
                gluonApplicationName,
                gluonTeamName,
                gluonProjectName);
        } else {
            return gluonProjectsWhichBelongToGluonTeam(ctx, gluonTeamName)
                .then(projects => {
                    return ctx.messageClient.respond({
                        text: "Please select a project which contains the application you would like to build",
                        attachments: [{
                            fallback: "Please select a project which contains the application you would like to build",
                            actions: [
                                menuForCommand({
                                        text: "Select Project", options:
                                            projects.map(project => {
                                                return {
                                                    value: project.name,
                                                    text: project.name,
                                                };
                                            }),
                                    },
                                    this, "projectName"),
                            ],
                        }],
                    });
                });
        }
    }

    private applicationsForGluonProject(ctx: HandlerContext,
                                        gluonApplicationName: string,
                                        gluonTeamName: string,
                                        gluonProjectName: string): Promise<HandlerResult> {
        if (!_.isEmpty(gluonApplicationName)) {
            logger.debug(`Kicking off build for application: ${gluonApplicationName}`);

            const teamDevOpsProjectId = `${_.kebabCase(gluonTeamName).toLowerCase()}-devops`;
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
                            logger.debug(`Using Jenkins Route host [${jenkinsHost.output}] to kick off build`);

                            return kickOffBuild(
                                jenkinsHost.output,
                                token.output,
                                gluonProjectName,
                                gluonApplicationName,
                            )
                                .then(() => {
                                    return ctx.messageClient.respond({
                                        text: `🚀 *${gluonApplicationName}* is being built...`,
                                    });
                                }, error => {
                                    if (error.response.status === 404) {
                                        logger.warn(`This is probably the first build and therefore a master branch job does not exist`);
                                        return kickOffFirstBuild(
                                            jenkinsHost.output,
                                            token.output,
                                            gluonProjectName,
                                            gluonApplicationName,
                                        )
                                            .then(() => {
                                                return ctx.messageClient.respond({
                                                    text: `🚀 *${gluonApplicationName}* is being built for the first time...`,
                                                });
                                            });
                                    } else {
                                        return failure(error);
                                    }
                                });
                        });
                });
        } else {
            return gluonApplicationsLinkedToGluonProject(ctx, gluonProjectName)
                .then(applications => {
                    return ctx.messageClient.respond({
                        text: "Please select the application you would like to build",
                        attachments: [{
                            fallback: "Please select the application you would like to build",
                            actions: [
                                menuForCommand({
                                        text: "Select application",
                                        options:
                                            applications.map(application => {
                                                return {
                                                    value: application.name,
                                                    text: application.name,
                                                };
                                            }),
                                    },
                                    this, "applicationName"),
                            ],
                        }],
                    });
                });
        }
    }
}
