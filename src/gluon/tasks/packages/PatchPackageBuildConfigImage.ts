import {HandlerContext} from "@atomist/automation-client";
import {OpenShiftConfig} from "../../../config/OpenShiftConfig";
import {QMConfig} from "../../../config/QMConfig";
import {OpenshiftResource} from "../../../openshift/api/resources/OpenshiftResource";
import {OCService} from "../../services/openshift/OCService";
import {getBuildConfigName} from "../../util/packages/Applications";
import {QMError} from "../../util/shared/Error";
import {getDevOpsEnvironmentDetails} from "../../util/team/Teams";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

export class PatchPackageBuildConfigImage extends Task {

    private readonly TASK_PATCH_BUILD_CONFIG: string = TaskListMessage.createUniqueTaskName("PatchPackageBuildConfigImage");

    constructor(private imageName: string,
                private packageName: string,
                private projectName: string,
                private teamName: string,
                private openshiftEnvironment: OpenShiftConfig = QMConfig.subatomic.openshiftNonProd,
                private ocService = new OCService()) {
        super();
    }

    protected configureTaskListMessage(taskListMessage: TaskListMessage) {
        const devopsProjectId = getDevOpsEnvironmentDetails(this.teamName).openshiftProjectId;
        const buildConfigName = getBuildConfigName(this.projectName, this.packageName);
        this.taskListMessage.addTask(this.TASK_PATCH_BUILD_CONFIG, `Patch BuildConfig *${devopsProjectId}/${buildConfigName}*`);
    }

    protected async executeTask(ctx: HandlerContext): Promise<boolean> {
        if (this.taskListMessage === undefined) {
            throw new QMError("TaskListMessage is undefined.");
        }
        await this.ocService.login(this.openshiftEnvironment, true);
        await this.patchBuildConfig();
        return true;
    }

    private async patchBuildConfig() {

        const devopsProjectId = getDevOpsEnvironmentDetails(this.teamName).openshiftProjectId;

        const buildConfigName = getBuildConfigName(this.projectName, this.packageName);

        const buildConfigPatch = this.getBuildConfigData(buildConfigName, this.imageName);

        await this.ocService.patchResourceInNamespace(buildConfigPatch, devopsProjectId);

        await this.taskListMessage.succeedTask(this.TASK_PATCH_BUILD_CONFIG);
    }

    private getBuildConfigData(appBuildName: string, baseS2IImage: string): OpenshiftResource {
        return {
            apiVersion: "v1",
            kind: "BuildConfig",
            metadata: {
                name: appBuildName,
            },
            spec: {
                strategy: {
                    sourceStrategy: {
                        from: {
                            name: baseS2IImage,
                        },
                    },
                },
            },
        };
    }
}
