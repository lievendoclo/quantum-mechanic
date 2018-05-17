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
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo,
    menuForTeams,
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
        if (_.isEmpty(this.teamName) || _.isEmpty(this.projectName) || _.isEmpty(this.applicationName)) {
            return this.requestUnsetParameters(ctx);
        }

        return this.applicationsForGluonProject(ctx, this.applicationName, this.teamName, this.projectName);
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
                                "Please select the team which contains the owning project of the application you would like to build");
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
                });
        }
        if (_.isEmpty(this.applicationName)) {
            return gluonApplicationsLinkedToGluonProject(ctx, this.projectName).then(applications => {
                return menuForApplications(
                    ctx,
                    applications,
                    this,
                    "Please select the application you would like to build");
            });
        }

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
