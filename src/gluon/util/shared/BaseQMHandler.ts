export class BaseQMHandler {
    get handlerResult() {
        if (this.result === undefined) {
            this.result = HandlerResultStatus.unset;
        }
        return this.result;
    }

    set handlerResult(value) {
        this.result = value;
    }

    get resultMessage() {
        if (this.message === undefined) {
            this.message = "";
        }
        return this.message;
    }

    set resultMessage(value) {
        this.message = value;
    }

    private result;
    private message: string;

    public succeedCommand(message?: string) {
        this.handlerResult = HandlerResultStatus.success;
        this.resultMessage = message;
    }

    public failCommand(message?: string) {
        this.handlerResult = HandlerResultStatus.failure;
        this.resultMessage = message;
    }

}

export enum HandlerResultStatus {
    unset = "unset",
    success = "success",
    failure = "failure",
}
