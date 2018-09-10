import {HandlerContext, logger} from "@atomist/automation-client";
import {OpenShiftConfig} from "../../../config/OpenShiftConfig";
import {JenkinsService} from "../../services/jenkins/JenkinsService";
import {OCService} from "../../services/openshift/OCService";
import {
    roleBindingDefinition,
    serviceAccountDefinition,
} from "../../util/jenkins/JenkinsOpenshiftResources";
import {getProjectId} from "../../util/project/Project";
import {
    getDevOpsEnvironmentDetails,
    getDevOpsEnvironmentDetailsProd,
} from "../../util/team/Teams";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

export class AddJenkinsToProdEnvironment extends Task {

    private readonly TASK_HEADER = TaskListMessage.createUniqueTaskName("ConfigureProjectJenkins");
    private readonly TASK_CREATE_JENKINS_SA = TaskListMessage.createUniqueTaskName("CreateJenkinsSA");
    private readonly TASK_ADD_JENKINS_SA_RIGHTS = TaskListMessage.createUniqueTaskName("JenkinsSAEdit");
    private readonly TASK_ADD_JENKINS_CREDENTIALS = TaskListMessage.createUniqueTaskName("JenkinsCredentials");

    constructor(private devOpsRequestedEvent,
                private environmentsRequestedDetails,
                private openshiftEnvironment: OpenShiftConfig,
                private jenkinsService = new JenkinsService(),
                private ocService = new OCService()) {
        super();
    }

    protected configureTaskListMessage(taskListMessage: TaskListMessage) {
        taskListMessage.addTask(this.TASK_HEADER, `*Configure project in Jenkins on ${this.openshiftEnvironment.name}*`);
        taskListMessage.addTask(this.TASK_CREATE_JENKINS_SA, "\tCreate Jenkins Service Account");
        taskListMessage.addTask(this.TASK_ADD_JENKINS_SA_RIGHTS, "\tGrant Jenkins Service Account permissions");
        taskListMessage.addTask(this.TASK_ADD_JENKINS_CREDENTIALS, "\tAdd project environment credentials to Jenkins");
    }

    protected async executeTask(ctx: HandlerContext): Promise<boolean> {
        const teamDevOpsNonProd = getDevOpsEnvironmentDetails(this.devOpsRequestedEvent.team.name).openshiftProjectId;
        const teamDevOpsProd = getDevOpsEnvironmentDetailsProd(this.devOpsRequestedEvent.team.name).openshiftProjectId;
        logger.info(`Working with OpenShift project Id: ${teamDevOpsProd}`);

        await this.ocService.login(this.openshiftEnvironment, true);

        await this.createJenkinsServiceAccount(teamDevOpsProd);
        const prodToken = await this.ocService.getServiceAccountToken("subatomic-jenkins", teamDevOpsProd);
        await this.taskListMessage.succeedTask(this.TASK_CREATE_JENKINS_SA);

        for (const environment of this.openshiftEnvironment.defaultEnvironments) {
            const projectId = getProjectId(this.environmentsRequestedDetails.owningTenant.name, this.environmentsRequestedDetails.project.name, environment.id);
            logger.info(`Working with OpenShift project Id: ${projectId}`);
            await this.addEditRolesToJenkinsServiceAccount(teamDevOpsProd, projectId);
        }
        await this.taskListMessage.succeedTask(this.TASK_ADD_JENKINS_SA_RIGHTS);

        await this.ocService.login();

        const jenkinsToken = await this.ocService.getServiceAccountToken("subatomic-jenkins", teamDevOpsNonProd);

        const jenkinsHost = await this.ocService.getJenkinsHost(teamDevOpsNonProd);

        await this.createJenkinsCredentials(teamDevOpsNonProd, jenkinsHost.output, jenkinsToken, this.openshiftEnvironment.name, prodToken);

        await this.taskListMessage.succeedTask(this.TASK_ADD_JENKINS_CREDENTIALS);

        await this.taskListMessage.succeedTask(this.TASK_HEADER);

        return true;
    }

    private async createJenkinsServiceAccount(projectId: string) {
        await this.ocService.applyResourceFromDataInNamespace(serviceAccountDefinition(), projectId);

        await this.ocService.applyResourceFromDataInNamespace(roleBindingDefinition(), projectId, true);
    }

    private async addEditRolesToJenkinsServiceAccount(teamDevOpsProd: string, destinationNamespace: string) {

        await this.ocService.addRoleToUserInNamespace(
            `system:serviceaccount:${teamDevOpsProd}:subatomic-jenkins`,
            "edit",
            destinationNamespace);
    }

    private async createJenkinsCredentials(teamDevOpsProjectId: string, jenkinsHost: string, token: string, prodName: string, secretValue: string) {

        const jenkinsCredentials = {
            "": "0",
            "credentials": {
                scope: "GLOBAL",
                id: `${teamDevOpsProjectId}-${prodName}`,
                secret: secretValue,
                description: `${teamDevOpsProjectId}-${prodName}`,
                $class: "org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl",
            },
        };

        await this.jenkinsService.createJenkinsCredentialsWithRetries(6, 5000, jenkinsHost, token, teamDevOpsProjectId, jenkinsCredentials);
    }
}
