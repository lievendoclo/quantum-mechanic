import {
    HandlerContext,
    HandlerResult,
    logger,
    success,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {OCService} from "../../services/openshift/OCService";
import {ApplicationType} from "../../util/packages/Applications";
import {getProjectDevOpsId, getProjectId} from "../../util/project/Project";
import {QMError} from "../../util/shared/Error";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

export class ConfigurePackageInOpenshift extends Task {

    private readonly TASK_CREATE_IMAGE_STREAM = "CreateImageStream";
    private readonly TASK_CREATE_BUILD_CONFIG = "CreateBuildConfig";
    private readonly TASK_ADD_RESOURCES_TO_ENVIRONMENTS = "AddResources";

    constructor(private deploymentDetails: PackageDeploymentDetails,
                private packageDetails: PackageDetails,
                private ocService = new OCService(),
                private gluonService = new GluonService()) {
        super();
    }

    protected configureTaskListMessage(taskListMessage: TaskListMessage) {
        this.taskListMessage.addTask(this.TASK_CREATE_IMAGE_STREAM, "Create Openshift Image Stream");
        this.taskListMessage.addTask(this.TASK_CREATE_BUILD_CONFIG, "Create Openshift Build Config");
        this.taskListMessage.addTask(this.TASK_ADD_RESOURCES_TO_ENVIRONMENTS, "Add Resources To Deployment Environments");
    }

    protected async executeTask(ctx: HandlerContext): Promise<boolean> {
        if (this.taskListMessage === undefined) {
            throw new QMError("TaskListMessage is undefined.");
        }
        await this.doConfiguration();
        return true;
    }

    private async doConfiguration() {

        const teamDevOpsProjectId = `${_.kebabCase(this.packageDetails.owningTeamName).toLowerCase()}-devops`;
        logger.debug(`Using owning team DevOps project: ${teamDevOpsProjectId}`);

        if (this.packageDetails.packageType === ApplicationType.DEPLOYABLE.toString()) {
            await this.ocService.login();
            const appBuildName = `${_.kebabCase(this.packageDetails.projectName).toLowerCase()}-${_.kebabCase(this.packageDetails.packageName).toLowerCase()}`;
            await this.createApplicationImageStream(appBuildName, teamDevOpsProjectId);

            await this.taskListMessage.succeedTask(this.TASK_CREATE_IMAGE_STREAM);

            await this.createApplicationBuildConfig(this.packageDetails.bitbucketRepoRemoteUrl, appBuildName, this.deploymentDetails.baseS2IImage, teamDevOpsProjectId);

            await this.taskListMessage.succeedTask(this.TASK_CREATE_BUILD_CONFIG);

            const project = await this.gluonService.projects.gluonProjectFromProjectName(this.packageDetails.projectName);
            logger.info(`Trying to find tenant: ${project.owningTenant}`);
            const tenant = await this.gluonService.tenants.gluonTenantFromTenantId(project.owningTenant);
            logger.info(`Found tenant: ${tenant}`);
            await this.createApplicationOpenshiftResources(tenant.name, project.name, this.packageDetails.packageName);

            await this.taskListMessage.succeedTask(this.TASK_ADD_RESOURCES_TO_ENVIRONMENTS);
        }
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
                        uri: `${bitbucketRepoRemoteUrl.replace("7999", String(QMConfig.subatomic.bitbucket.sshPort))}`,
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

        for (const envVariableName of Object.keys(this.deploymentDetails.buildEnvironmentVariables)) {
            buildConfig.spec.strategy.sourceStrategy.env.push(
                {
                    name: envVariableName,
                    value: this.deploymentDetails.buildEnvironmentVariables[envVariableName],
                },
            );
        }

        await this.ocService.createResourceFromDataInNamespace(
            buildConfig,
            teamDevOpsProjectId,
            true);  // TODO clean up this hack - cannot be a boolean (magic)
    }

    private async createApplicationOpenshiftResources(tenantName: string, projectName: string, applicationName: string): Promise<HandlerResult> {

        const environments: string [] = ["dev", "sit", "uat"];

        for (const environment of environments) {
            const projectId = getProjectId(tenantName, projectName, environment);
            const appName = `${_.kebabCase(applicationName).toLowerCase()}`;
            const devOpsProjectId = getProjectDevOpsId(this.packageDetails.teamName);
            logger.info(`Processing app [${appName}] Template for: ${projectId}`);

            const template = await this.ocService.getSubatomicTemplate(this.deploymentDetails.openshiftTemplate);
            const appBaseTemplate: any = JSON.parse(template.output);
            appBaseTemplate.metadata.namespace = projectId;
            await this.ocService.createResourceFromDataInNamespace(appBaseTemplate, projectId);

            const templateParameters = [
                `APP_NAME=${appName}`,
                `IMAGE_STREAM_PROJECT=${projectId}`,
                `DEVOPS_NAMESPACE=${devOpsProjectId}`,
            ];

            const appProcessedTemplate = await this.ocService.processOpenshiftTemplate(
                this.deploymentDetails.openshiftTemplate,
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
}

export interface PackageDeploymentDetails {
    buildEnvironmentVariables: { [key: string]: string };
    openshiftTemplate: string;
    baseS2IImage: string;
}

export interface PackageDetails {
    teamName: string;
    projectName: string;
    packageName: string;
    packageType: string;
    bitbucketRepoRemoteUrl: string;
    owningTeamName: string;
}
