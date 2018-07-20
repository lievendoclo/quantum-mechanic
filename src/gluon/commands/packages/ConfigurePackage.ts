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
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {url} from "@atomist/slack-messages";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {QMTemplate} from "../../../template/QMTemplate";
import {JenkinsService} from "../../util/jenkins/Jenkins";
import {OCService} from "../../util/openshift/OCService";
import {
    ApplicationService,
    ApplicationType,
    menuForApplications,
} from "../../util/packages/Applications";
import {getProjectDevOpsId, getProjectId} from "../../util/project/Project";
import {
    menuForProjects,
    ProjectService,
} from "../../util/project/ProjectService";
import {
    handleQMError,
    QMError,
    ResponderMessageClient,
} from "../../util/shared/Error";
import {createMenu} from "../../util/shared/GenericMenu";
import {isSuccessCode} from "../../util/shared/Http";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/shared/RecursiveParameterRequestCommand";
import {TenantService} from "../../util/shared/TenantService";
import {menuForTeams, TeamService} from "../../util/team/TeamService";
import {KickOffJenkinsBuild} from "../jenkins/JenkinsBuild";

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

    constructor(private teamService = new TeamService(),
                private tenantService = new TenantService(),
                private projectService = new ProjectService(),
                private applicationService = new ApplicationService(),
                private jenkinsService = new JenkinsService(),
                private ocService = new OCService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            await ctx.messageClient.addressChannels({
                text: "🚀 Your package is being configured...",
            }, this.teamChannel);
            return await this.configurePackage(ctx);
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
                const teams = await this.teamService.gluonTeamsWhoSlackScreenNameBelongsTo(this.screenName);
                return await menuForTeams(
                    ctx,
                    teams,
                    this,
                    "Please select a team associated with the project you wish to configure the package for");
            }

        }
        if (_.isEmpty(this.projectName)) {
            const projects = await this.projectService.gluonProjectsWhichBelongToGluonTeam(this.teamName);
            return await menuForProjects(ctx, projects, this, "Please select the owning project of the package you wish to configure");
        }
        if (_.isEmpty(this.applicationName)) {
            const applications = await this.applicationService.gluonApplicationsLinkedToGluonProject(this.projectName);
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

        const project = await this.projectService.gluonProjectFromProjectName(this.projectName);
        const application = await this.applicationService.gluonApplicationForNameAndProjectName(this.applicationName, this.projectName);
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

    private getPathFromJenkinsfileName(jenkinsfileName: string): string {
        return this.JENKINSFILE_FOLDER + jenkinsfileName + this.JENKINSFILE_EXTENSION;
    }

    private async configurePackage(ctx: HandlerContext): Promise<HandlerResult> {
        const project = await this.projectService.gluonProjectFromProjectName(this.projectName);

        const application = await this.applicationService.gluonApplicationForNameAndProjectName(this.applicationName, this.projectName);

        return await this.doConfiguration(
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
    }

    private async addJenkinsFile(bitbucketProjectKey, bitbucketRepoName): Promise<HandlerResult> {

        if (this.jenkinsfileName !== this.JENKINSFILE_EXISTS) {
            const username = QMConfig.subatomic.bitbucket.auth.username;
            const password = QMConfig.subatomic.bitbucket.auth.password;
            const project: GitProject = await GitCommandGitProject.cloned({
                    username,
                    password,
                },
                new BitBucketServerRepoRef(
                    QMConfig.subatomic.bitbucket.baseUrl,
                    bitbucketProjectKey,
                    bitbucketRepoName));
            try {
                await project.findFile("Jenkinsfile");
            } catch (error) {
                logger.info("Jenkinsfile doesnt exist. Adding it!");
                const jenkinsTemplate: QMTemplate = new QMTemplate(this.getPathFromJenkinsfileName(this.jenkinsfileName as string));
                await project.addFile("Jenkinsfile",
                    jenkinsTemplate.build({}));
            }

            const clean = await project.isClean();
            logger.debug(`Jenkinsfile has been added: ${clean.success}`);

            if (!clean.success) {
                await project.setUserConfig(
                    QMConfig.subatomic.bitbucket.auth.username,
                    QMConfig.subatomic.bitbucket.auth.email,
                );
                await project.commit(`Added Jenkinsfile`);
                await project.push();
            } else {
                logger.debug("Jenkinsfile already exists");
            }
        }

        return await success();
    }

    private async createApplicationImageStream(appBuildName: string, teamDevOpsProjectId: string) {
        await this.ocService.createResourceFromDataInNamespace({
            apiVersion: "v1",
            kind: "ImageStream",
            metadata: {
                name: appBuildName,
            },
        }, teamDevOpsProjectId);
    }

    private getBuildConfigData(bitbucketRepoRemoteUrl: string, appBuildName: string, baseS2IImage: string): { [key: string]: any } {
        return {
            apiVersion: "v1",
            kind: "BuildConfig",
            metadata: {
                name: appBuildName,
            },
            spec: {
                resources: {
                    limits: {
                        cpu: "0",
                        memory: "0",
                    },
                },
                source: {
                    type: "Git",
                    git: {
                        // temporary hack because of the NodePort
                        // TODO remove this!
                        uri: `${bitbucketRepoRemoteUrl.replace("7999", "30999")}`,
                        ref: "master",
                    },
                    sourceSecret: {
                        name: "bitbucket-ssh",
                    },
                },
                strategy: {
                    sourceStrategy: {
                        from: {
                            kind: "ImageStreamTag",
                            name: baseS2IImage,
                        },
                        env: [],
                    },
                },
                output: {
                    to: {
                        kind: "ImageStreamTag",
                        name: `${appBuildName}:latest`,
                    },
                },
            },
        };
    }

    private async createApplicationBuildConfig(bitbucketRepoRemoteUrl: string, appBuildName: string, baseS2IImage: string, teamDevOpsProjectId: string) {

        logger.info(`Using Git URI: ${bitbucketRepoRemoteUrl}`);
        const buildConfig: { [key: string]: any } = this.getBuildConfigData(bitbucketRepoRemoteUrl, appBuildName, baseS2IImage);

        for (const envVariableName of Object.keys(this.buildEnvironmentVariables)) {
            buildConfig.spec.strategy.sourceStrategy.env.push(
                {
                    name: envVariableName,
                    value: this.buildEnvironmentVariables[envVariableName],
                },
            );
        }

        await this.ocService.createResourceFromDataInNamespace(
            buildConfig,
            teamDevOpsProjectId,
            true);  // TODO clean up this hack - cannot be a boolean (magic)
    }

    private async doConfiguration(ctx: HandlerContext,
                                  projectName: string,
                                  projectId: string,
                                  packageName: string,
                                  packageType: string,
                                  bitbucketProjectKey: string,
                                  bitbucketRepoName: string,
                                  bitbucketRepoRemoteUrl: string,
                                  owningTeamName: string,
                                  associatedTeams: any[]): Promise<HandlerResult> {

        const teamDevOpsProjectId = `${_.kebabCase(owningTeamName).toLowerCase()}-devops`;
        logger.debug(`Using owning team DevOps project: ${teamDevOpsProjectId}`);
        logger.debug(`Teams are: ${JSON.stringify(associatedTeams)}`);

        await this.ocService.login();

        await this.addJenkinsFile(bitbucketProjectKey, bitbucketRepoName);

        await this.createJenkinsJob(
            teamDevOpsProjectId,
            projectName,
            projectId,
            packageName,
            bitbucketProjectKey,
            bitbucketRepoName.toLowerCase(),
        );

        if (packageType === ApplicationType.DEPLOYABLE.toString()) {
            const appBuildName = `${_.kebabCase(projectName).toLowerCase()}-${_.kebabCase(packageName).toLowerCase()}`;
            await this.createApplicationImageStream(appBuildName, teamDevOpsProjectId);

            await this.createApplicationBuildConfig(bitbucketRepoRemoteUrl, appBuildName, this.baseS2IImage, teamDevOpsProjectId);

            const project = await this.projectService.gluonProjectFromProjectName(projectName);
            logger.info(`Trying to find tenant: ${project.owningTenant}`);
            const tenant = await this.tenantService.gluonTenantFromTenantId(project.owningTenant);
            logger.info(`Found tenant: ${tenant}`);
            await this.createApplicationOpenshiftResources(tenant.name, project.name, packageName);

            return await this.sendPackageProvisionedMessage(ctx, packageName, projectName, associatedTeams, ApplicationType.DEPLOYABLE);
        } else {
            return await this.sendPackageProvisionedMessage(ctx, packageName, projectName, associatedTeams, ApplicationType.LIBRARY);
        }
    }

    private async sendPackageProvisionedMessage(ctx: HandlerContext, applicationName: string, projectName: string, associatedTeams: any[], applicationType: ApplicationType) {
        let packageTypeString = "application";
        if (applicationType === ApplicationType.LIBRARY) {
            packageTypeString = "library";
        }

        return await ctx.messageClient.addressChannels({
            text: `Your ${packageTypeString} *${applicationName}*, in project *${projectName}*, has been provisioned successfully ` +
            "and is ready to build/deploy",
            attachments: [{
                fallback: `Your ${packageTypeString} has been provisioned successfully`,
                footer: `For more information, please read the ${this.docs() + "#jenkins-build"}`,
                text: `
You can kick off the build pipeline for your ${packageTypeString} by clicking the button below or pushing changes to your ${packageTypeString}'s repository`,
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
    }

    private async createApplicationOpenshiftResources(tenantName: string, projectName: string, applicationName: string): Promise<HandlerResult> {

        const environments: string [] = ["dev", "sit", "uat"];

        for (const environment of environments) {
            const projectId = getProjectId(tenantName, projectName, environment);
            const appName = `${_.kebabCase(applicationName).toLowerCase()}`;
            const devOpsProjectId = getProjectDevOpsId(this.teamName);
            logger.info(`Processing app [${appName}] Template for: ${projectId}`);

            const template = await this.ocService.getSubatomicTemplate(this.openshiftTemplate);
            const appBaseTemplate: any = JSON.parse(template.output);
            appBaseTemplate.metadata.namespace = projectId;
            await this.ocService.createResourceFromDataInNamespace(appBaseTemplate, projectId);

            const templateParameters = [
                `APP_NAME=${appName}`,
                `IMAGE_STREAM_PROJECT=${projectId}`,
                `DEVOPS_NAMESPACE=${devOpsProjectId}`,
            ];

            const appProcessedTemplate = await this.ocService.processOpenshiftTemplate(
                this.openshiftTemplate,
                projectId,
                templateParameters,
                true);

            logger.debug(`Processed app [${appName}] Template: ${appProcessedTemplate.output}`);

            try {
                await this.ocService.getDeploymentConfigInNamespace(appName, projectId);
                logger.warn(`App [${appName}] Template has already been processed, deployment exists`);
            } catch (error) {
                await this.ocService.createResourceFromDataInNamespace(
                    JSON.parse(appProcessedTemplate.output),
                    projectId,
                );
            }
        }
        return await success();
    }

    private async createJenkinsJob(teamDevOpsProjectId: string,
                                   gluonProjectName: string,
                                   gluonProjectId: string,
                                   gluonApplicationName: string,
                                   bitbucketProjectKey: string,
                                   bitbucketRepositoryName: string): Promise<HandlerResult> {
        const token = await this.ocService.getServiceAccountToken("subatomic-jenkins", teamDevOpsProjectId);
        const jenkinsHost = await this.ocService.getJenkinsHost(teamDevOpsProjectId);
        logger.debug(`Using Jenkins Route host [${jenkinsHost.output}] to add Bitbucket credentials`);

        const jenkinsTemplate: QMTemplate = new QMTemplate("resources/templates/jenkins/jenkins-multi-branch-project.xml");
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

        const createJenkinsJobResponse = await this.jenkinsService.createJenkinsJob(
            jenkinsHost.output,
            token.output,
            gluonProjectName,
            gluonApplicationName,
            builtTemplate);

        if (!isSuccessCode(createJenkinsJobResponse.status)) {
            if (createJenkinsJobResponse.status === 400) {
                logger.warn(`Multibranch job for [${gluonApplicationName}] probably already created`);
            } else {
                logger.error(`Unable to create jenkinsJob`);
                throw new QMError("Failed to create jenkins job. Network request failed.");
            }
        }
        return await success();
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference`,
            "documentation")}`;
    }
}
