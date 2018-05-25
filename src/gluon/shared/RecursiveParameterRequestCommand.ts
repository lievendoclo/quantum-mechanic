import {
    HandleCommand,
    HandlerContext,
    HandlerResult, logger,
} from "@atomist/automation-client";
import {
    BaseParameter,
    declareParameter,
} from "@atomist/automation-client/internal/metadata/decoratorSupport";
import _ = require("lodash");

export abstract class RecursiveParameterRequestCommand implements HandleCommand<HandlerResult> {

    private recursiveParameterProperties: string[];

    public handle(ctx: HandlerContext): Promise<HandlerResult> {

        if (!this.recursiveParametersAreSet()) {
            return this.requestNextUnsetParameter(ctx);
        }

        return this.runCommand(ctx);
    }

    public addRecursiveParameterProperty(propertyKey: string) {
        if (_.isEmpty(this.recursiveParameterProperties)) {
            this.recursiveParameterProperties = [];
        }
        this.recursiveParameterProperties.push(propertyKey);
    }

    protected requestNextUnsetParameter(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Requesting next unset recursive parameter.`);
        const result: Promise<HandlerResult> = this.setNextParameter(ctx) || null;

        if (result !== null) {
            return result;
        }

        logger.info(`Recursive parameter request returned a void result. Assuming all recursive parameters are set.`);

        return this.runCommand(ctx);
    }

    protected abstract setNextParameter(ctx: HandlerContext): Promise<HandlerResult> | void;

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
