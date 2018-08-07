import {HandlerContext} from "@atomist/automation-client";
import {Task} from "./Task";
import {TaskListMessage} from "./TaskListMessage";

export class TaskRunner {
    private tasks: Task[] = [];

    constructor(private taskListMessage: TaskListMessage) {
    }

    public addTask(task: Task): TaskRunner {
        task.setTaskListMessage(this.taskListMessage);
        this.tasks.push(task);
        return this;
    }

    public async execute(ctx: HandlerContext) {
        await this.taskListMessage.display();
        try {
            for (const task of this.tasks) {
                if (!await task.execute(ctx)) {
                    await this.taskListMessage.failRemainingTasks();
                    return false;
                }
            }
        } catch (error) {
            await this.taskListMessage.failRemainingTasks();
            throw error;
        }
        return true;
    }
}
