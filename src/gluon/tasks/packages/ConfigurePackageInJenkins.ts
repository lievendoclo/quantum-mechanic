import {
    HandlerContext,
    HandlerResult,
    logger,
    success,
} from "@atomist/automation-client";
import {BitBucketServerRepoRef} from "@atomist/automation-client/operations/common/BitBucketServerRepoRef";
import {GitCommandGitProject} from "@atomist/automation-client/project/git/GitCommandGitProject";
import {GitProject} from "@atomist/automation-client/project/git/GitProject";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {url} from "@atomist/slack-messages";
import {QMConfig} from "../../../config/QMConfig";
import {isSuccessCode} from "../../../http/Http";
import {QMTemplate} from "../../../template/QMTemplate";
import {KickOffJenkinsBuild} from "../../commands/jenkins/JenkinsBuild";
import {JenkinsService} from "../../services/jenkins/JenkinsService";
import {OCService} from "../../services/openshift/OCService";
import {ApplicationType} from "../../util/packages/Applications";
import {QMError} from "../../util/shared/Error";
import {getDevOpsEnvironmentDetails} from "../../util/team/Teams";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

export class ConfigurePackageInJenkins extends Task {

    private readonly JENKINSFILE_EXTENSION = ".groovy";
    private readonly JENKINSFILE_FOLDER = "resources/templates/jenkins/jenkinsfile-repo/";
    private readonly JENKINSFILE_EXISTS = "JENKINS_FILE_EXISTS";

    private readonly TASK_ADD_JENKINS_FILE = "AddJenkinsfile";
    private readonly TASK_CREATE_JENKINS_JOB = "CreateJenkinsJob";

    constructor(private application,
                private project,
                private bitbucketRepository,
                private bitbucketProject,
                private owningTeam,
                private jenkinsFile,
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
            this.bitbucketProject.key,
            this.bitbucketRepository.name,
        );

        await this.taskListMessage.succeedTask(this.TASK_ADD_JENKINS_FILE);

        const devopsDetails = getDevOpsEnvironmentDetails(this.owningTeam.name);

        await this.createJenkinsJob(
            devopsDetails.openshiftProjectId,
            this.project.name,
            this.project.projectId,
            this.application.name,
            this.bitbucketProject.key,
            this.bitbucketRepository.name);

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
            [this.owningTeam],
            applicationType);

        return true;
    }

    private async addJenkinsFile(jenkinsfileName, bitbucketProjectKey, bitbucketRepoName): Promise<HandlerResult> {

        if (jenkinsfileName !== this.JENKINSFILE_EXISTS) {
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
                const jenkinsTemplate: QMTemplate = new QMTemplate(this.getPathFromJenkinsfileName(jenkinsfileName as string));
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

    private getPathFromJenkinsfileName(jenkinsfileName: string): string {
        return this.JENKINSFILE_FOLDER + jenkinsfileName + this.JENKINSFILE_EXTENSION;
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
            token,
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
            team.slackIdentity.teamChannel));
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference`,
            "documentation")}`;
    }

}
