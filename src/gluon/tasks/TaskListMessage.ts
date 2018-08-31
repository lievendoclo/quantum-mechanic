import {HandlerResult, logger} from "@atomist/automation-client";
import {Attachment, SlackMessage} from "@atomist/slack-messages";
import {v4 as uuid} from "uuid";
import {QMMessageClient} from "../util/shared/Error";

export class TaskListMessage {

    public static createUniqueTaskName(name: string) {
        return name + uuid();
    }

    private statusCosmetics = new Map<TaskStatus, { color: string, symbol: string }>();
    private readonly messageId: string;
    private readonly tasks: { [k: string]: Task };
    private readonly taskOrder: string[];

    constructor(private titleMessage, private messageClient: QMMessageClient) {
        this.messageId = uuid();
        this.tasks = {};
        this.taskOrder = [];
        this.statusCosmetics.set(TaskStatus.Pending, {
            color: "#ffcc00",
            symbol: "●",
        });
        this.statusCosmetics.set(TaskStatus.Failed, {
            color: "#D94649",
            symbol: "✗",
        });
        this.statusCosmetics.set(TaskStatus.Successful, {
            color: "#45B254",
            symbol: "✓",
        });
    }

    public addTask(key: string, description: string) {
        this.tasks[key] = {description, status: TaskStatus.Pending};
        this.taskOrder.push(key);
    }

    public async succeedTask(key: string) {
        return await this.setTaskStatus(key, TaskStatus.Successful);
    }

    public async setTaskStatus(key: string, status: TaskStatus): Promise<HandlerResult> {
        logger.info(JSON.stringify(this.tasks));
        this.tasks[key].status = status;
        return await this.display();
    }

    public failRemainingTasks(): Promise<HandlerResult> {
        this.taskOrder.map(taskName => {
            if (this.tasks[taskName].status === TaskStatus.Pending) {
                this.tasks[taskName].status = TaskStatus.Failed;
            }
        });
        return this.display();
    }

    public display(): Promise<HandlerResult> {
        return this.messageClient.send(this.generateMessage(), {id: this.messageId});
    }

    private generateMessage() {
        const message: SlackMessage = {
            text: this.titleMessage,
            attachments: [],
        };
        for (const key of this.taskOrder) {
            const task = this.tasks[key];
            const statusCosmetic = this.statusCosmetics.get(task.status);
            const messageText = `${task.description}\n`;
            message.attachments.push({
                text: `${statusCosmetic.symbol} ${messageText}`,
                color: statusCosmetic.color,
            } as Attachment);
        }
        return message;
    }
}

interface Task {
    description: string;
    status: number;
}

export enum TaskStatus {
    Pending,
    Successful,
    Failed,
}
