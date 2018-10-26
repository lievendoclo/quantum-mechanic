import {HandlerContext, logger} from "@atomist/automation-client";
import {OpenShiftConfig} from "../../../config/OpenShiftConfig";
import {QMConfig} from "../../../config/QMConfig";
import {isSuccessCode} from "../../../http/Http";
import {QMTemplate} from "../../../template/QMTemplate";
import {JenkinsService} from "../../services/jenkins/JenkinsService";
import {OCService} from "../../services/openshift/OCService";
import {getJenkinsBitbucketAccessCredential} from "../../util/jenkins/JenkinsCredentials";
import {getProjectId} from "../../util/project/Project";
import {QMError} from "../../util/shared/Error";
import {getDevOpsEnvironmentDetails} from "../../util/team/Teams";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

export class ConfigureJenkinsForProject extends Task {

    private readonly TASK_HEADER = TaskListMessage.createUniqueTaskName("ConfigureProjectJenkins");
    private readonly TASK_ADD_JENKINS_SA_RIGHTS = TaskListMessage.createUniqueTaskName("JenkinsSAEdit");
    private readonly TASK_CREATE_JENKINS_BUILD_TEMPLATE = TaskListMessage.createUniqueTaskName("JenkinsBuildTemplate");
    private readonly TASK_ADD_JENKINS_CREDENTIALS = TaskListMessage.createUniqueTaskName("JenkinsCredentials");

    constructor(private environmentsRequestedEvent,
                private openshiftEnvironment: OpenShiftConfig = QMConfig.subatomic.openshiftNonProd,
                private ocService = new OCService(),
                private jenkinsService = new JenkinsService()) {
        super();
    }

    protected configureTaskListMessage(taskListMessage: TaskListMessage) {
        this.taskListMessage.addTask(this.TASK_HEADER, `*Configure project in Jenkins on ${this.openshiftEnvironment.name}*`);
        this.taskListMessage.addTask(this.TASK_ADD_JENKINS_SA_RIGHTS, "\tGrant Jenkins Service Account permissions");
        this.taskListMessage.addTask(this.TASK_CREATE_JENKINS_BUILD_TEMPLATE, "\tCreate Jenkins build folder");
        this.taskListMessage.addTask(this.TASK_ADD_JENKINS_CREDENTIALS, "\tAdd project environment credentials to Jenkins");
    }

    protected async executeTask(ctx: HandlerContext): Promise<boolean> {
        const teamDevOpsProjectId = getDevOpsEnvironmentDetails(this.environmentsRequestedEvent.teams[0].name).openshiftProjectId;

        await this.ocService.login(this.openshiftEnvironment);

        await this.addEditRolesToJenkinsServiceAccount(
            teamDevOpsProjectId,
            this.environmentsRequestedEvent.project.name,
            this.environmentsRequestedEvent.owningTenant.name);

        await this.taskListMessage.succeedTask(this.TASK_ADD_JENKINS_SA_RIGHTS);

        const token = await this.ocService.getServiceAccountToken("subatomic-jenkins", teamDevOpsProjectId);
        const jenkinsHost = await this.ocService.getJenkinsHost(teamDevOpsProjectId);

        logger.debug(`Using Jenkins Route host [${jenkinsHost.output}] to add Bitbucket credentials`);

        await this.createJenkinsBuildTemplate(this.environmentsRequestedEvent, teamDevOpsProjectId, jenkinsHost.output, token);

        await this.taskListMessage.succeedTask(this.TASK_CREATE_JENKINS_BUILD_TEMPLATE);

        await this.createJenkinsCredentials(teamDevOpsProjectId, jenkinsHost.output, token);

        await this.taskListMessage.succeedTask(this.TASK_ADD_JENKINS_CREDENTIALS);

        await this.taskListMessage.succeedTask(this.TASK_HEADER);

        return true;
    }

    private async addEditRolesToJenkinsServiceAccount(teamDevOpsProjectId: string, projectName: string, tenant: string) {

        for (const environment of this.openshiftEnvironment.defaultEnvironments) {
            const openshiftProjectId = getProjectId(tenant, projectName, environment.id);
            await this.ocService.addRoleToUserInNamespace(
                `system:serviceaccount:${teamDevOpsProjectId}:jenkins`,
                "edit",
                openshiftProjectId);
        }
    }

    private async createJenkinsBuildTemplate(environmentsRequestedEvent, teamDevOpsProjectId: string, jenkinsHost: string, token: string) {
        const projectTemplate: QMTemplate = new QMTemplate("resources/templates/jenkins/jenkins-openshift-environment-credentials.xml");
        const parameters: { [k: string]: any } = {
            projectName: environmentsRequestedEvent.project.name,
            docsUrl: QMConfig.subatomic.docs.baseUrl,
            teamDevOpsProjectId,
        };

        for (const environment of this.openshiftEnvironment.defaultEnvironments) {
            parameters[`${environment.id}ProjectId`] = getProjectId(environmentsRequestedEvent.owningTenant.name, environmentsRequestedEvent.project.name, environment.id);
        }

        const builtTemplate: string = projectTemplate.build(parameters);
        logger.info("Template found and built successfully.");
        const jenkinsCreateItemResult = await this.jenkinsService.createOpenshiftEnvironmentCredentials(jenkinsHost, token, environmentsRequestedEvent.project.name, builtTemplate);

        if (!isSuccessCode(jenkinsCreateItemResult.status)) {
            if (jenkinsCreateItemResult.status === 400) {
                logger.warn(`Folder for [${environmentsRequestedEvent.project.name}] probably already created`);
            } else {
                throw new QMError("Failed to create jenkins build template. Network timeout occurred.");
            }
        }
    }

    private async createJenkinsCredentials(teamDevOpsProjectId: string, jenkinsHost: string, token: string) {

        const jenkinsCredentials = getJenkinsBitbucketAccessCredential(teamDevOpsProjectId);

        await this.jenkinsService.createJenkinsCredentialsWithRetries(6, 5000, jenkinsHost, token, teamDevOpsProjectId, jenkinsCredentials);
    }

}
