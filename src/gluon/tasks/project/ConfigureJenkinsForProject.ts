import {HandlerContext, logger} from "@atomist/automation-client";
import {QMConfig} from "../../../config/QMConfig";
import {QMTemplate} from "../../../template/QMTemplate";
import {JenkinsService} from "../../services/jenkins/JenkinsService";
import {OCService} from "../../services/openshift/OCService";
import {getProjectId} from "../../util/project/Project";
import {QMError} from "../../util/shared/Error";
import {isSuccessCode} from "../../util/shared/Http";
import {getDevOpsEnvironmentDetails} from "../../util/team/Teams";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

export class ConfigureJenkinsForProject extends Task {

    private readonly TASK_ADD_JENKINS_SA_RIGHTS = "JenkinsSAEdit";
    private readonly TASK_CREATE_JENKINS_BUILD_TEMPLATE = "JenkinsBuildTemplate";
    private readonly TASK_ADD_JENKINS_CREDENTIALS = "JenkinsCredentials";

    constructor(private environmentsRequestedEvent,
                private ocService = new OCService(),
                private jenkinsService = new JenkinsService()) {
        super();
    }

    protected configureTaskListMessage(taskListMessage: TaskListMessage) {
        this.taskListMessage.addTask(this.TASK_ADD_JENKINS_SA_RIGHTS, "Grant Jenkins Service Account permissions");
        this.taskListMessage.addTask(this.TASK_CREATE_JENKINS_BUILD_TEMPLATE, "Create Jenkins build folder");
        this.taskListMessage.addTask(this.TASK_ADD_JENKINS_CREDENTIALS, "Add project environment credentials to Jenkins");
    }

    protected async executeTask(ctx: HandlerContext): Promise<boolean> {
        const teamDevOpsProjectId = getDevOpsEnvironmentDetails(this.environmentsRequestedEvent.teams[0].name).openshiftProjectId;

        await this.addEditRolesToJenkinsServiceAccount(
            teamDevOpsProjectId,
            this.environmentsRequestedEvent.project.name,
            this.environmentsRequestedEvent.owningTenant.name);

        await this.taskListMessage.succeedTask(this.TASK_ADD_JENKINS_SA_RIGHTS);

        const token = await this.ocService.getServiceAccountToken("subatomic-jenkins", teamDevOpsProjectId);
        const jenkinsHost = await this.ocService.getJenkinsHost(teamDevOpsProjectId);

        logger.debug(`Using Jenkins Route host [${jenkinsHost.output}] to add Bitbucket credentials`);

        await this.createJenkinsBuildTemplate(this.environmentsRequestedEvent, teamDevOpsProjectId, jenkinsHost.output, token.output);

        await this.taskListMessage.succeedTask(this.TASK_CREATE_JENKINS_BUILD_TEMPLATE);

        await this.createJenkinsCredentials(teamDevOpsProjectId, jenkinsHost.output, token.output);

        await this.taskListMessage.succeedTask(this.TASK_ADD_JENKINS_CREDENTIALS);

        return true;
    }

    private async addEditRolesToJenkinsServiceAccount(teamDevOpsProjectId: string, projectName: string, tenant: string) {
        const environments = ["dev", "sit", "uat"];

        await this.ocService.login();

        for (const environment of environments) {
            const openshiftProjectId = getProjectId(tenant, projectName, environment);
            await this.ocService.addRoleToUserInNamespace(
                `system:serviceaccount:${teamDevOpsProjectId}:jenkins`,
                "edit",
                openshiftProjectId);
        }
    }

    private async createJenkinsBuildTemplate(environmentsRequestedEvent, teamDevOpsProjectId: string, jenkinsHost: string, token: string) {
        const projectTemplate: QMTemplate = new QMTemplate("resources/templates/jenkins/jenkins-openshift-environment-credentials.xml");
        const builtTemplate: string = projectTemplate.build(
            {
                projectName: environmentsRequestedEvent.project.name,
                docsUrl: QMConfig.subatomic.docs.baseUrl,
                teamDevOpsProjectId,
                devProjectId: getProjectId(environmentsRequestedEvent.owningTenant.name, environmentsRequestedEvent.project.name, "dev"),
                sitProjectId: getProjectId(environmentsRequestedEvent.owningTenant.name, environmentsRequestedEvent.project.name, "sit"),
                uatProjectId: getProjectId(environmentsRequestedEvent.owningTenant.name, environmentsRequestedEvent.project.name, "uat"),
            },
        );
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

        const jenkinsCredentials = {
            "": "0",
            "credentials": {
                scope: "GLOBAL",
                id: `${teamDevOpsProjectId}-bitbucket`,
                username: QMConfig.subatomic.bitbucket.auth.username,
                password: QMConfig.subatomic.bitbucket.auth.password,
                description: `${teamDevOpsProjectId}-bitbucket`,
                $class: "com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl",
            },
        };

        await this.jenkinsService.createJenkinsCredentialsWithRetries(6, 5000, jenkinsHost, token, teamDevOpsProjectId, jenkinsCredentials);
    }

}
