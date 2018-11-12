import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Tags,
} from "@atomist/automation-client";
import {SlackMessage} from "@atomist/slack-messages";
import {QMConfig} from "../../../config/QMConfig";
import {TeamMembershipMessages} from "../../messages/member/TeamMembershipMessages";
import {QMApplication} from "../../services/gluon/ApplicationService";
import {GluonService} from "../../services/gluon/GluonService";
import {QMProjectProdRequest} from "../../services/gluon/ProjectProdRequestService";
import {ConfigurePackageInJenkins} from "../../tasks/packages/ConfigurePackageInJenkins";
import {TaskListMessage} from "../../tasks/TaskListMessage";
import {TaskRunner} from "../../tasks/TaskRunner";
import {ProdDefaultJenkinsJobTemplate} from "../../util/jenkins/JenkinsJobTemplates";
import {QMMemberBase} from "../../util/member/Members";
import {QMProject, QMProjectBase} from "../../util/project/Project";
import {
    GluonApplicationNameSetter,
    GluonProjectNameSetter,
    GluonTeamNameSetter,
    setGluonApplicationName,
    setGluonProjectName,
    setGluonTeamName,
} from "../../util/recursiveparam/GluonParameterSetters";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/recursiveparam/RecursiveParameterRequestCommand";
import {
    handleQMError,
    QMError,
    ResponderMessageClient,
} from "../../util/shared/Error";
import {isUserAMemberOfTheTeam, QMTeam} from "../../util/team/Teams";

@CommandHandler("Add a prod deployment job to jenkins for an application", QMConfig.subatomic.commandPrefix + " configure application jenkins prod")
@Tags("subatomic", "package", "jenkins")
export class ConfigureApplicationJenkinsProd extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter, GluonProjectNameSetter, GluonApplicationNameSetter {

    private static PROD_JENKINSFILE = "jenkinsfile.prod";

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        applicationName: "APPLICATION_NAME",
        projectName: "PROJECT_NAME",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        recursiveKey: ConfigureApplicationJenkinsProd.RecursiveKeys.teamName,
    })
    public teamName: string;

    @RecursiveParameter({
        recursiveKey: ConfigureApplicationJenkinsProd.RecursiveKeys.applicationName,
        selectionMessage: "Please select the application you wish to deploy to prod",
    })
    public applicationName: string;

    @RecursiveParameter({
        recursiveKey: ConfigureApplicationJenkinsProd.RecursiveKeys.projectName,
        selectionMessage: "Please select the owning project of the application you wish to deploy to prod",
    })
    public projectName: string;

    private teamMembershipMessages: TeamMembershipMessages = new TeamMembershipMessages();

    constructor(public gluonService = new GluonService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {

        logger.info(`Trying to create prod jenkins config for Team: ${this.teamName}, Project: ${this.projectName}, Application: ${this.applicationName}`);

        const messageClient: ResponderMessageClient = new ResponderMessageClient(ctx);

        try {
            const member: QMMemberBase = await this.gluonService.members.gluonMemberFromScreenName(this.screenName);

            const requestingTeam: QMTeam = await this.gluonService.teams.gluonTeamByName(this.teamName);

            if (!isUserAMemberOfTheTeam(member, requestingTeam)) {
                return await messageClient.send(this.teamMembershipMessages.notAMemberOfTheTeam());
            }

            const project: QMProject = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);

            await this.assertProjectProdIsApproved(project);

            const application: QMApplication = await this.gluonService.applications.gluonApplicationForNameAndProjectName(this.applicationName, this.projectName);

            const taskListMessage: TaskListMessage = new TaskListMessage(":rocket: Configuring Application Prod Jenkins...", messageClient);
            const taskRunner: TaskRunner = new TaskRunner(taskListMessage);

            taskRunner.addTask(
                new ConfigurePackageInJenkins(application, project, ConfigureApplicationJenkinsProd.PROD_JENKINSFILE, ProdDefaultJenkinsJobTemplate, this.getSuccessMessage(application.name, project.name)),
            );

            await taskRunner.execute(ctx);

        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(ConfigureApplicationJenkinsProd.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(ConfigureApplicationJenkinsProd.RecursiveKeys.projectName, setGluonProjectName);
        this.addRecursiveSetter(ConfigureApplicationJenkinsProd.RecursiveKeys.applicationName, setGluonApplicationName);
    }

    private async assertProjectProdIsApproved(project: QMProjectBase) {
        const projectProdRequests: QMProjectProdRequest[] = await this.gluonService.prod.project.getProjectProdRequestsByProjectId(project.projectId);

        let isProjectProdApproved = false;

        for (const prodRequest of projectProdRequests) {
            if (prodRequest.approvalStatus.toUpperCase() === "APPROVED") {
                isProjectProdApproved = true;
                break;
            }
        }

        if (!isProjectProdApproved) {
            throw new QMError(`The project ${project.name} has not been approved for a production release. Please request and approve prod promotion for this project before retrying.`);
        }
    }

    private getSuccessMessage(applicationName: string, projectName: string): SlackMessage {

        return {
            text: `Your prod jenkins deployment for application *${applicationName}*, in project *${projectName}*, has been provisioned successfully.`,
            attachments: [{
                fallback: `Your prod deployment has been provisioned successfully`,
                text: `
You can kick off the build deployment for your application by starting it in Jenkins.`,
                mrkdwn_in: ["text"],
            }],
        };
    }

}
