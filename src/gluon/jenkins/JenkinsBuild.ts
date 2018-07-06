import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {OCCommandResult} from "../../openshift/base/OCCommandResult";
import {SimpleOption} from "../../openshift/base/options/SimpleOption";
import {OCCommon} from "../../openshift/OCCommon";
import {
    ApplicationService,
    menuForApplications,
} from "../packages/Applications";
import {menuForProjects, ProjectService} from "../project/ProjectService";
import {handleQMError, QMError, ResponderMessageClient} from "../shared/Error";
import {isSuccessCode} from "../shared/Http";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../shared/RecursiveParameterRequestCommand";
import {menuForTeams, TeamService} from "../team/TeamService";
import {JenkinsService} from "./Jenkins";

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

    constructor(private teamService = new TeamService(),
                private projectService = new ProjectService(),
                private applicationService = new ApplicationService(),
                private jenkinsService = new JenkinsService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext) {
        try {
            return await this.applicationsForGluonProject(ctx, this.applicationName, this.teamName, this.projectName);
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected async setNextParameter(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
            try {
                const team = await this.teamService.gluonTeamForSlackTeamChannel(this.teamChannel);
                this.teamName = team.name;
                return await this.handle(ctx);
            } catch (error) {
                const teams = await this.teamService.gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName);
                return await menuForTeams(
                    ctx,
                    teams,
                    this,
                    "Please select the team which contains the owning project of the application you would like to build");
            }
        }
        if (_.isEmpty(this.projectName)) {
            const projects = await this.projectService.gluonProjectsWhichBelongToGluonTeam(ctx, this.teamName);
            return menuForProjects(
                ctx,
                projects,
                this,
                "Please select a project which contains the application you would like to build");
        }
        if (_.isEmpty(this.applicationName)) {
            const applications = await this.applicationService.gluonApplicationsLinkedToGluonProject(ctx, this.projectName);
            return await menuForApplications(
                ctx,
                applications,
                this,
                "Please select the application you would like to build");
        }
    }

    private async applicationsForGluonProject(ctx: HandlerContext,
                                              gluonApplicationName: string,
                                              gluonTeamName: string,
                                              gluonProjectName: string): Promise<HandlerResult> {
        logger.debug(`Kicking off build for application: ${gluonApplicationName}`);

        const teamDevOpsProjectId = `${_.kebabCase(gluonTeamName).toLowerCase()}-devops`;
        const token = await this.getJenkinsServiceAccountToken(teamDevOpsProjectId);

        const jenkinsHost = await this.getJenkinsHost(teamDevOpsProjectId);

        logger.debug(`Using Jenkins Route host [${jenkinsHost.output}] to kick off build`);

        const kickOffBuildResult = await this.jenkinsService.kickOffBuild(
            jenkinsHost.output,
            token.output,
            gluonProjectName,
            gluonApplicationName,
        );
        if (isSuccessCode(kickOffBuildResult.status)) {
            return await ctx.messageClient.respond({
                text: `🚀 *${gluonApplicationName}* is being built...`,
            });
        } else {
            if (kickOffBuildResult.status === 404) {
                logger.warn(`This is probably the first build and therefore a master branch job does not exist`);
                await this.jenkinsService.kickOffFirstBuild(
                    jenkinsHost.output,
                    token.output,
                    gluonProjectName,
                    gluonApplicationName,
                );
                return await ctx.messageClient.respond({
                    text: `🚀 *${gluonApplicationName}* is being built for the first time...`,
                });
            } else {
                logger.error(`Failed to kick off JenkinsBuild. Error: ${JSON.stringify(kickOffBuildResult)}`);
                throw new QMError("Failed to kick off jenkins build. Network failure connecting to Jenkins instance.");
            }
        }
    }

    private async getJenkinsServiceAccountToken(teamDevOpsProjectId: string): Promise<OCCommandResult> {
        return await OCCommon.commonCommand("serviceaccounts",
            "get-token",
            [
                "subatomic-jenkins",
            ], [
                new SimpleOption("-namespace", teamDevOpsProjectId),
            ]);
    }

    private async getJenkinsHost(teamDevOpsProjectId: string): Promise<OCCommandResult> {
        return await OCCommon.commonCommand(
            "get",
            "route/jenkins",
            [],
            [
                new SimpleOption("-output", "jsonpath={.spec.host}"),
                new SimpleOption("-namespace", teamDevOpsProjectId),
            ]);
    }
}
