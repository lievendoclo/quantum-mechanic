import {HandlerContext, logger} from "@atomist/automation-client";
import {OpenShiftConfig} from "../../../config/OpenShiftConfig";
import {OCService} from "../../services/openshift/OCService";
import {getProjectId} from "../../util/project/Project";
import {QMError} from "../../util/shared/Error";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

export class CreateOpenshiftResourcesInProject extends Task {

    private dynamicTaskNameStore: { [k: string]: string } = {};

    constructor(private projectName: string,
                private tenantName: string,
                private openshiftEnvironment: OpenShiftConfig,
                private openshiftResources: any,
                private ocService = new OCService()) {
        super();
    }

    protected configureTaskListMessage(taskListMessage: TaskListMessage) {
        for (const environment of this.openshiftEnvironment.defaultEnvironments) {
            const internalTaskId = `${environment.id}Environment`;
            const projectName = getProjectId(this.tenantName, this.projectName, environment.id);
            this.dynamicTaskNameStore[internalTaskId] = TaskListMessage.createUniqueTaskName(internalTaskId);
            this.taskListMessage.addTask(this.dynamicTaskNameStore[internalTaskId], `\tCreate resources in *${this.openshiftEnvironment.name} - ${projectName}*`);
        }
    }

    protected async executeTask(ctx: HandlerContext): Promise<boolean> {
        if (this.taskListMessage === undefined) {
            throw new QMError("TaskListMessage is undefined.");
        }
        await this.doConfiguration();
        return true;
    }

    private async doConfiguration() {
        await this.ocService.login(this.openshiftEnvironment);

        for (const environment of this.openshiftEnvironment.defaultEnvironments) {
            const prodProjectId = getProjectId(this.tenantName, this.projectName, environment.id);

            await this.ocService.createResourceFromDataInNamespace(this.openshiftResources, prodProjectId);
            logger.info(JSON.stringify(this.dynamicTaskNameStore));
            await this.taskListMessage.succeedTask(this.dynamicTaskNameStore[`${environment.id}Environment`]);
        }

    }
}
