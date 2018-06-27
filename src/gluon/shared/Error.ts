import {
    HandlerContext,
    HandlerResult,
    logger,
    success,
} from "@atomist/automation-client";
import {MessageOptions} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage} from "@atomist/slack-messages";
import * as util from "util";
import {OCCommandResult} from "../../openshift/base/OCCommandResult";

export function logErrorAndReturnSuccess(method, error): HandlerResult {
    logger.info(`Don't display the error - ${method} already handles it.`);
    logger.error(error);
    return success();
}

export async function handleQMError(messageClient: QMMessageClient, error) {
    logger.error("Trying to handle QM error.");
    if (error && "code" in error && error.code === "ECONNREFUSED") {
        logger.error(`Error code suggests and external service is down.\nError: ${util.inspect(error)}`);
        return await messageClient.send(`❗Unexpected failure. An external service dependency appears to be down.`);
    } else if (error instanceof Error) {
        logger.error(`Error is of default Error type.\nError: ${util.inspect(error)}`);
        return await messageClient.send(`❗Unhandled exception occurred. Please alert your system admin to check the logs and correct the issue accordingly.`);
    } else if (error instanceof QMError) {
        logger.error(`Error is of QMError type. Error: ${error.message}`);
        return await messageClient.send(`${error.getSlackMessage()}`);
    } else if (error instanceof OCResultError) {
        logger.error(`Error is of OCResultError type. Error: ${error.message}`);
        return await messageClient.send(`${error.getSlackMessage()}`);
    } else if (error instanceof OCCommandResult) {
        logger.error(`Error is of OCCommandResult type (unhandled OCCommand failure).
        Command: ${error.command}
        Error: ${error.error}`);

        return await messageClient.send(`❗An Openshift command failed to run successfully. Please alert your system admin to check the logs and correct the issue accordingly.`);
    }
    logger.error("Unknown error type. Rethrowing error.");
    throw new Error(error);
}

export class QMError extends Error {
    constructor(message: string, protected slackMessage: SlackMessage | string = null) {
        super(message);
    }

    public getSlackMessage() {
        if (this.slackMessage === null) {
            return `❗${this.message}`;
        }
        return this.slackMessage;
    }
}

export class OCResultError extends QMError {
    constructor(private ocCommandResult: OCCommandResult, message: string, slackMessage: SlackMessage | string = message) {
        super(message, slackMessage);
        this.message = `${message}
        Command: ${ocCommandResult.command}
        Error: ${ocCommandResult.error}`;
    }
}

export interface QMMessageClient {
    send(message: (string | SlackMessage), options?: MessageOptions): Promise<HandlerResult>;
}

export class ResponderMessageClient implements QMMessageClient {
    private ctx: HandlerContext;

    constructor(ctx: HandlerContext) {
        this.ctx = ctx;
    }

    public async send(message: (string | SlackMessage), options?: MessageOptions): Promise<HandlerResult> {
        return await this.ctx.messageClient.respond(message, options);
    }
}

export class UserMessageClient implements QMMessageClient {
    private ctx: HandlerContext;
    private readonly users: string[];

    constructor(ctx: HandlerContext) {
        this.ctx = ctx;
        this.users = [];
    }

    public addDestination(user: string) {
        this.users.push(user);
        return this;
    }

    public async send(message: (string | SlackMessage), options?: MessageOptions): Promise<HandlerResult> {
        return await this.ctx.messageClient.addressUsers(message, this.users, options);
    }
}

export class ChannelMessageClient implements QMMessageClient {
    private ctx: HandlerContext;
    private readonly channels: string[];

    constructor(ctx: HandlerContext) {
        this.ctx = ctx;
        this.channels = [];
    }

    public addDestination(channel: string) {
        this.channels.push(channel);
        return this;
    }

    public async send(message: (string | SlackMessage), options?: MessageOptions): Promise<HandlerResult> {
        return await this.ctx.messageClient.addressChannels(message, this.channels, options);
    }
}
