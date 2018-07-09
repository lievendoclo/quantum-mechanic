import {
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
} from "@atomist/automation-client";
import {
    BaseParameter,
    declareParameter,
} from "@atomist/automation-client/internal/metadata/decoratorSupport";
import _ = require("lodash");
import {handleQMError, QMError, ResponderMessageClient} from "./Error";

export abstract class RecursiveParameterRequestCommand implements HandleCommand<HandlerResult> {

    private recursiveParameterProperties: string[];

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {

        if (!this.recursiveParametersAreSet()) {
            try {
                return await this.requestNextUnsetParameter(ctx);
            } catch (error) {
                return await this.handleRequestNextParameterError(ctx, error);
            }
        }

        return await this.runCommand(ctx);
    }

    public addRecursiveParameterProperty(propertyKey: string) {
        if (_.isEmpty(this.recursiveParameterProperties)) {
            this.recursiveParameterProperties = [];
        }
        this.recursiveParameterProperties.push(propertyKey);
    }

    protected async requestNextUnsetParameter(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Requesting next unset recursive parameter.`);
        const result: Promise<HandlerResult> = this.setNextParameter(ctx) || null;

        if (result !== null) {
            return await result;
        }

        throw new QMError("Recursive parameters could not be set correctly. This is an implementation fault. Please raise an issue.");
    }

    protected abstract setNextParameter(ctx: HandlerContext): Promise<HandlerResult>;

    protected abstract runCommand(ctx: HandlerContext): Promise<HandlerResult>;

    private recursiveParametersAreSet(): boolean {
        let parametersAreSet = true;
        const dynamicClassInstance: any = this;
        for (const property of this.recursiveParameterProperties) {
            if (_.isEmpty(dynamicClassInstance[property])) {
                logger.info(`Recursive parameter ${property} not set.`);
                parametersAreSet = false;
                break;
            }
        }
        return parametersAreSet;
    }

    private async handleRequestNextParameterError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }
}

export function RecursiveParameter(details: BaseParameter = {}) {
    return (target: any, propertyKey: string) => {
        const recursiveParameters: any = {...details};
        if (target instanceof RecursiveParameterRequestCommand) {
            recursiveParameters.required = false;
            recursiveParameters.displayable = false;
            target.addRecursiveParameterProperty(propertyKey);
        }
        declareParameter(target, propertyKey, recursiveParameters);
    };
}
