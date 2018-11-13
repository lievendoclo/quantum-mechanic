import {
    BitBucketServerRepoRef,
    HandlerContext,
    HandlerResult,
    logger,
    success,
} from "@atomist/automation-client";
import {GitCommandGitProject} from "@atomist/automation-client/project/git/GitCommandGitProject";
import {GitProject} from "@atomist/automation-client/project/git/GitProject";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import _ = require("lodash");
import {QMConfig} from "../../../config/QMConfig";
import {isSuccessCode} from "../../../http/Http";
import {QMTemplate} from "../../../template/QMTemplate";
import {KickOffJenkinsBuild} from "../../commands/jenkins/JenkinsBuild";
import {QMApplication} from "../../services/gluon/ApplicationService";
import {JenkinsService} from "../../services/jenkins/JenkinsService";
import {OCService} from "../../services/openshift/OCService";
import {
    JenkinsJobTemplate,
    NonProdDefaultJenkinsJobTemplate,
} from "../../util/jenkins/JenkinsJobTemplates";
import {ApplicationType} from "../../util/packages/Applications";
import {QMProject} from "../../util/project/Project";
import {ParameterDisplayType} from "../../util/recursiveparam/RecursiveParameterRequestCommand";
import {GitError, QMError} from "../../util/shared/Error";
import {getDevOpsEnvironmentDetails, QMTeamBase} from "../../util/team/Teams";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

export class ConfigurePackageInJenkins extends Task {

    private readonly JENKINSFILE_EXISTS_FLAG = "JENKINS_FILE_EXISTS";
    private readonly JENKINSFILE_FOLDER = "resources/templates/jenkins/jenkinsfile-repo/";
    private readonly JENKINSFILE_EXTENSION = ".groovy";

    private readonly TASK_ADD_JENKINS_FILE = "AddJenkinsfile";
    private readonly TASK_CREATE_JENKINS_JOB = "CreateJenkinsJob";

    constructor(private application: QMApplication,
                private project: QMProject,
                private jenkinsFile: string,
                private jenkinsJobTemplate: JenkinsJobTemplate = NonProdDefaultJenkinsJobTemplate,
                private successMessage?: SlackMessage,
                private ocService = new OCService(),
                private jenkinsService = new JenkinsService()) {
        super();
    }

    protected configureTaskListMessage(taskListMessage: TaskListMessage) {
        this.taskListMessage.addTask(this.TASK_ADD_JENKINS_FILE, "Add Jenkinsfile");
        this.taskListMessage.addTask(this.TASK_CREATE_JENKINS_JOB, "Create Jenkins Job");
    }

    protected async executeTask(ctx: HandlerContext): Promise<boolean> {
        await this.ocService.login();

        await this.addJenkinsFile(
            this.jenkinsFile,
            this.project.bitbucketProject.key,
            this.application.bitbucketRepository.slug,
            this.jenkinsJobTemplate.expectedJenkinsfile,
        );

        await this.taskListMessage.succeedTask(this.TASK_ADD_JENKINS_FILE);

        const devopsDetails = getDevOpsEnvironmentDetails(this.project.owningTeam.name);

        await this.createJenkinsJob(
            devopsDetails.openshiftProjectId,
            this.project,
            this.application,
            this.jenkinsJobTemplate);

        await this.taskListMessage.succeedTask(this.TASK_CREATE_JENKINS_JOB);

        logger.info(`PackageConfigured successfully`);

        let applicationType = ApplicationType.LIBRARY;
        if (this.application.applicationType === ApplicationType.DEPLOYABLE.toString()) {
            applicationType = ApplicationType.DEPLOYABLE;
        }

        await this.sendPackageProvisionedMessage(
            ctx,
            this.application.name,
            this.project.name,
            [this.project.owningTeam],
            applicationType);

        return true;
    }

    private async createJenkinsJob(teamDevOpsProjectId: string,
                                   project: QMProject,
                                   application: QMApplication,
                                   jenkinsJobTemplate: JenkinsJobTemplate): Promise<HandlerResult> {
        const token = await this.ocService.getServiceAccountToken("subatomic-jenkins", teamDevOpsProjectId);
        const jenkinsHost = await this.ocService.getJenkinsHost(teamDevOpsProjectId);
        logger.debug(`Using Jenkins Route host [${jenkinsHost.output}] to add Bitbucket credentials`);

        const jenkinsTemplate: QMTemplate = new QMTemplate(`resources/templates/jenkins/${jenkinsJobTemplate.templateFilename}`);
        const builtTemplate: string = jenkinsTemplate.build(
            {
                gluonApplicationName: application.name,
                gluonBaseUrl: QMConfig.subatomic.gluon.baseUrl,
                gluonProjectId: project.projectId,
                bitbucketBaseUrl: QMConfig.subatomic.bitbucket.baseUrl,
                teamDevOpsProjectId,
                bitbucketProjectKey: project.bitbucketProject.key,
                bitbucketRepositoryName: application.bitbucketRepository.name,
            },
        );

        const createJenkinsJobResponse = await this.jenkinsService.createJenkinsJob(
            jenkinsHost.output,
            token,
            project.name,
            application.name + jenkinsJobTemplate.jobNamePostfix,
            builtTemplate);

        if (!isSuccessCode(createJenkinsJobResponse.status)) {
            if (createJenkinsJobResponse.status === 400) {
                logger.warn(`Multibranch job for [${application.name}] probably already created`);
            } else {
                logger.error(`Unable to create jenkinsJob`);
                throw new QMError("Failed to create jenkins job. Network request failed.");
            }
        }
        return await success();
    }

    private async sendPackageProvisionedMessage(ctx: HandlerContext, applicationName: string, projectName: string, associatedTeams: QMTeamBase[], applicationType: ApplicationType) {

        let returnableSuccessMessage = this.getDefaultSuccessMessage(applicationName, projectName, applicationType);

        if (!_.isEmpty(this.successMessage)) {
            returnableSuccessMessage = this.successMessage;
        }

        return await ctx.messageClient.addressChannels(returnableSuccessMessage, associatedTeams.map(team =>
            team.slack.teamChannel));
    }

    private async addJenkinsFile(jenkinsfileName, bitbucketProjectKey, bitbucketRepositorySlug, destinationJenkinsfileName: string = "Jenkinsfile"): Promise<HandlerResult> {

        if (jenkinsfileName !== this.JENKINSFILE_EXISTS_FLAG) {
            const username = QMConfig.subatomic.bitbucket.auth.username;
            const password = QMConfig.subatomic.bitbucket.auth.password;
            const project: GitProject = await GitCommandGitProject.cloned({
                    username,
                    password,
                },
                new BitBucketServerRepoRef(
                    QMConfig.subatomic.bitbucket.baseUrl,
                    bitbucketProjectKey,
                    bitbucketRepositorySlug));
            try {
                await project.findFile(destinationJenkinsfileName);
            } catch (error) {
                logger.info("Jenkinsfile doesnt exist. Adding it!");
                const jenkinsTemplate: QMTemplate = new QMTemplate(this.getPathFromJenkinsfileName(jenkinsfileName as string));
                await project.addFile(destinationJenkinsfileName,
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
                try {
                    await project.push();
                } catch (error) {
                    logger.debug(`Error pushing Jenkins file to repository`);
                    throw new GitError(error.message);
                }
            } else {
                logger.debug("Jenkinsfile already exists");
            }
        }

        return await success();
    }

    private getPathFromJenkinsfileName(jenkinsfileName: string): string {
        return this.JENKINSFILE_FOLDER + jenkinsfileName + this.JENKINSFILE_EXTENSION;
    }

    private getDefaultSuccessMessage(applicationName: string, projectName: string, applicationType: ApplicationType): SlackMessage {
        let packageTypeString = "application";
        if (applicationType === ApplicationType.LIBRARY) {
            packageTypeString = "library";
        }

        return {
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
                            displayResultMenu: ParameterDisplayType.hide,
                        }),
                ],
            }],
        };
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference`,
            "documentation")}`;
    }

}
