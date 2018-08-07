import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    success,
} from "@atomist/automation-client";
import {BitBucketServerRepoRef} from "@atomist/automation-client/operations/common/BitBucketServerRepoRef";
import {GitCommandGitProject} from "@atomist/automation-client/project/git/GitCommandGitProject";
import {GitProject} from "@atomist/automation-client/project/git/GitProject";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {JenkinsService} from "../../services/jenkins/JenkinsService";
import {OCService} from "../../services/openshift/OCService";
import {ConfigurePackageInJenkins} from "../../tasks/packages/ConfigurePackageInJenkins";
import {ConfigurePackageInOpenshift} from "../../tasks/packages/ConfigurePackageInOpenshift";
import {TaskListMessage} from "../../tasks/TaskListMessage";
import {TaskRunner} from "../../tasks/TaskRunner";
import {menuForApplications} from "../../util/packages/Applications";
import {menuForProjects} from "../../util/project/Project";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";
import {createMenu} from "../../util/shared/GenericMenu";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/shared/RecursiveParameterRequestCommand";
import {menuForTeams} from "../../util/team/Teams";
import {GluonToEvent} from "../../util/transform/GluonToEvent";

@CommandHandler("Configure an existing application/library", QMConfig.subatomic.commandPrefix + " configure custom package")
export class ConfigurePackage extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        description: "application name",
    })
    public applicationName: string;

    @RecursiveParameter({
        description: "project name",
    })
    public projectName: string;

    @RecursiveParameter({
        description: "team name",
    })
    public teamName: string;

    @RecursiveParameter({
        description: "openshift template",
    })
    public openshiftTemplate: string;

    @RecursiveParameter({
        description: "base jenkinsfile",
    })
    public jenkinsfileName: string;

    @Parameter({
        description: "Base image for s2i build",
    })
    public baseS2IImage: string;

    public buildEnvironmentVariables: { [key: string]: string } = {};

    private readonly JENKINSFILE_EXTENSION = ".groovy";
    private readonly JENKINSFILE_FOLDER = "resources/templates/jenkins/jenkinsfile-repo/";
    private readonly JENKINSFILE_EXISTS = "JENKINS_FILE_EXISTS";

    constructor(private gluonService = new GluonService(),
                private jenkinsService = new JenkinsService(),
                private ocService = new OCService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            await ctx.messageClient.addressChannels({
                text: "Preparing to configure your package...",
            }, this.teamChannel);
            return await this.configurePackage(ctx);
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected async setNextParameter(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
            try {
                const team = await this.gluonService.teams.gluonTeamForSlackTeamChannel(this.teamChannel);
                this.teamName = team.name;
                return await this.handle(ctx);
            } catch (error) {
                const teams = await this.gluonService.teams.gluonTeamsWhoSlackScreenNameBelongsTo(this.screenName);
                return await menuForTeams(
                    ctx,
                    teams,
                    this,
                    "Please select a team associated with the project you wish to configure the package for");
            }

        }
        if (_.isEmpty(this.projectName)) {
            const projects = await this.gluonService.projects.gluonProjectsWhichBelongToGluonTeam(this.teamName);
            return await menuForProjects(ctx, projects, this, "Please select the owning project of the package you wish to configure");
        }
        if (_.isEmpty(this.applicationName)) {
            const applications = await this.gluonService.applications.gluonApplicationsLinkedToGluonProject(this.projectName);
            return await menuForApplications(ctx, applications, this, "Please select the package you wish to configure");
        }
        if (_.isEmpty(this.openshiftTemplate)) {
            const namespace = `${_.kebabCase(this.teamName).toLowerCase()}-devops`;
            const templatesResult = await this.ocService.getSubatomicAppTemplates(namespace);
            const templates = JSON.parse(templatesResult.output).items;
            return await createMenu(ctx, templates.map(template => {
                    return {
                        value: template.metadata.name,
                        text: template.metadata.name,
                    };
                }),
                this,
                "Please select the correct openshift template for your package",
                "Select a template",
                "openshiftTemplate");
        }
        if (_.isEmpty(this.jenkinsfileName)) {
            return await this.requestJenkinsFileParameter(ctx);
        }
    }

    private async requestJenkinsFileParameter(ctx: HandlerContext): Promise<HandlerResult> {

        const project = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);
        const application = await this.gluonService.applications.gluonApplicationForNameAndProjectName(this.applicationName, this.projectName);
        const username = QMConfig.subatomic.bitbucket.auth.username;
        const password = QMConfig.subatomic.bitbucket.auth.password;
        const gitProject: GitProject = await GitCommandGitProject.cloned({
                username,
                password,
            },
            new BitBucketServerRepoRef(
                QMConfig.subatomic.bitbucket.baseUrl,
                project.bitbucketProject.key,
                application.bitbucketRepository.name));
        try {
            await gitProject.findFile("Jenkinsfile");
            this.jenkinsfileName = this.JENKINSFILE_EXISTS;
            return success();
        } catch (error) {
            return await this.createMenuForJenkinsFileSelection(ctx);
        }
    }

    private async createMenuForJenkinsFileSelection(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info("Jenkinsfile does not exist. Requesting jenkinsfile selection.");
        const fs = require("fs");
        const jenkinsfileOptions: string [] = [];
        logger.info(`Searching folder: ${this.JENKINSFILE_FOLDER}`);
        fs.readdirSync(this.JENKINSFILE_FOLDER).forEach(file => {
            logger.info(`Found file: ${file}`);
            if (file.endsWith(this.JENKINSFILE_EXTENSION)) {
                jenkinsfileOptions.push(this.getNameFromJenkinsfilePath(file));
            }
        });
        return await createMenu(ctx, jenkinsfileOptions.map(jenkinsfile => {
                return {
                    value: jenkinsfile,
                    text: jenkinsfile,
                };
            }),
            this,
            "Please select the correct jenkinsfile for your package",
            "Select a jenkinsfile",
            "jenkinsfileName");
    }

    private getNameFromJenkinsfilePath(jenkinsfilePath: string): string {
        const jenkinsfileSlashSplit = jenkinsfilePath.split("/");
        let name = jenkinsfileSlashSplit[jenkinsfileSlashSplit.length - 1];
        // Remove file extension
        name = name.substring(0, jenkinsfilePath.length - this.JENKINSFILE_EXTENSION.length);
        return name;
    }

    private async configurePackage(ctx: HandlerContext): Promise<HandlerResult> {
        const project = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);

        const application = await this.gluonService.applications.gluonApplicationForNameAndProjectName(this.applicationName, this.projectName);

        const taskListMessage = new TaskListMessage(":rocket: Configuring package...", new ResponderMessageClient(ctx));
        const taskRunner = new TaskRunner(taskListMessage);
        taskRunner.addTask(
            new ConfigurePackageInOpenshift(
                {
                    buildEnvironmentVariables: this.buildEnvironmentVariables,
                    openshiftTemplate: this.openshiftTemplate,
                    baseS2IImage: this.baseS2IImage,
                },
                {
                    teamName: this.teamName,
                    projectName: this.projectName,
                    packageName: application.name,
                    packageType: application.applicationType,
                    bitbucketRepoRemoteUrl: application.bitbucketRepository.remoteUrl,
                    owningTeamName: project.owningTeam.name,
                }),
        ).addTask(
            new ConfigurePackageInJenkins(
                application,
                project,
                GluonToEvent.bitbucketRepository(application),
                GluonToEvent.bitbucketProject(project),
                GluonToEvent.team(project.owningTeam),
                this.jenkinsfileName),
        );

        await taskRunner.execute(ctx);

        return success();

    }

}
