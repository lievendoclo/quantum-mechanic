import {
    CommandHandler,
    failure,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {SimpleOption} from "../../openshift/base/options/SimpleOption";
import {OCCommon} from "../../openshift/OCCommon";
import {
    gluonApplicationsLinkedToGluonProject,
    menuForApplications,
} from "../packages/Applications";
import {
    gluonProjectsWhichBelongToGluonTeam,
    menuForProjects,
} from "../project/Projects";
import {logErrorAndReturnSuccess} from "../shared/Error";
import {RecursiveParameter, RecursiveParameterRequestCommand} from "../shared/RecursiveParameterRequestCommand";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo,
    menuForTeams,
} from "../team/Teams";
import {kickOffBuild, kickOffFirstBuild} from "./Jenkins";

@CommandHandler("Kick off a Jenkins build", QMConfig.subatomic.commandPrefix + " jenkins build")
export class KickOffJenkinsBuild extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUser)
    public slackName: string;

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        description: "team name",
    })
    public teamName: string;

    @RecursiveParameter({
        description: "project name",
    })
    public projectName: string;

    @RecursiveParameter({
        description: "application name",
    })
    public applicationName: string;

    protected runCommand(ctx: HandlerContext) {
        return this.applicationsForGluonProject(ctx, this.applicationName, this.teamName, this.projectName);
    }

    protected setNextParameter(ctx: HandlerContext): Promise<HandlerResult> | void {
        if (_.isEmpty(this.teamName)) {
            return gluonTeamForSlackTeamChannel(this.teamChannel)
                .then(
                    team => {
                        this.teamName = team.name;
                        return this.setNextParameter(ctx) || null;
                    },
                    () => {
                        return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName).then(teams => {
                            return menuForTeams(
                                ctx,
                                teams,
                                this,
                                "Please select the team which contains the owning project of the application you would like to build");
                        }).catch(error => {
                            logErrorAndReturnSuccess(gluonTeamsWhoSlackScreenNameBelongsTo.name, error);
                        });
                    },
                );
        }
        if (_.isEmpty(this.projectName)) {
            return gluonProjectsWhichBelongToGluonTeam(ctx, this.teamName)
                .then(projects => {
                    return menuForProjects(
                        ctx,
                        projects,
                        this,
                        "Please select a project which contains the application you would like to build");
                }).catch(error => {
                    logErrorAndReturnSuccess(gluonProjectsWhichBelongToGluonTeam.name, error);
                });
        }
        if (_.isEmpty(this.applicationName)) {
            return gluonApplicationsLinkedToGluonProject(ctx, this.projectName).then(applications => {
                return menuForApplications(
                    ctx,
                    applications,
                    this,
                    "Please select the application you would like to build");
            }).catch(error => {
                logErrorAndReturnSuccess(gluonApplicationsLinkedToGluonProject.name, error);
            });
        }

        return this.applicationsForGluonProject(ctx, this.applicationName, this.teamName, this.projectName);
    }

    private applicationsForGluonProject(ctx: HandlerContext,
                                        gluonApplicationName: string,
                                        gluonTeamName: string,
                                        gluonProjectName: string): Promise<HandlerResult> {
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
                                if (error.response && error.response.status === 404) {
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
    }
}
