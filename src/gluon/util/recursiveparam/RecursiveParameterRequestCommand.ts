import {
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    Parameter,
} from "@atomist/automation-client";
import {
    BaseParameter,
    declareParameter,
} from "@atomist/automation-client/internal/metadata/decoratorSupport";
import _ = require("lodash");
import uuid = require("uuid");
import {handleQMError, QMError, ResponderMessageClient} from "../shared/Error";
import {ParameterStatusDisplay} from "./ParameterStatusDisplay";

export abstract class RecursiveParameterRequestCommand implements HandleCommand<HandlerResult> {

    @Parameter({
        required: false,
        displayable: false,
    })
    public messagePresentationCorrelationId: string;

    @Parameter({
        required: false,
        displayable: false,
    })
    public displayResultMenu: ParameterDisplayType;

    private recursiveParameterOrder: string[] = [];

    private recursiveParameterList: string[];

    private recursiveParameterMap: { [key: string]: RecursiveParameterMapping };

    private parameterStatusDisplay: ParameterStatusDisplay;

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.messagePresentationCorrelationId)) {
            this.messagePresentationCorrelationId = uuid.v4();
        }

        if (_.isEmpty(this.displayResultMenu)) {
            this.displayResultMenu = ParameterDisplayType.show;
        }

        this.recursiveParameterOrder = [];
        this.configureParameterSetters();
        this.updateParameterStatusDisplayMessage();
        if (!this.recursiveParametersAreSet()) {
            try {
                return await this.requestNextUnsetParameter(ctx);
            } catch (error) {
                return await this.handleRequestNextParameterError(ctx, error);
            }
        }

        const displayMessage = this.parameterStatusDisplay.getDisplayMessage(this.getIntent(), this.displayResultMenu);

        await ctx.messageClient.respond(displayMessage, {id: this.messagePresentationCorrelationId});

        return await this.runCommand(ctx);
    }

    public addRecursiveParameterProperty(parameterDetails: RecursiveParameterDetails, propertyKey: string) {
        this.recursiveParameterMap = this.recursiveParameterMap !== undefined ? this.recursiveParameterMap : {};
        this.recursiveParameterList = this.recursiveParameterList !== undefined ? this.recursiveParameterList : [];
        if (this.recursiveParameterMap[parameterDetails.recursiveKey] === undefined) {
            this.recursiveParameterMap[parameterDetails.recursiveKey] = {
                propertyName: propertyKey,
                parameterSetter: undefined,
                selectionMessage: parameterDetails.selectionMessage,
                forceSet: parameterDetails.forceSet,
            };
            logger.info(JSON.stringify(this.recursiveParameterMap[parameterDetails.recursiveKey]));
            this.recursiveParameterList.push(parameterDetails.recursiveKey);
        } else {
            throw new QMError(`Duplicate recursive key ${parameterDetails.recursiveKey} defined. Recursive keys must be unique.`);
        }
    }

    protected async requestNextUnsetParameter(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Requesting next unset recursive parameter.`);
        const result: Promise<HandlerResult> = this.setNextParameter(ctx) || null;

        if (result !== null) {
            return await result;
        }

        throw new QMError("Recursive parameters could not be set correctly. This is an implementation fault. Please raise an issue.");
    }

    protected addRecursiveSetter(recursiveKey: string, setter: (ctx: HandlerContext, commandHandler: any, selectionMessage: string) => Promise<any>) {
        this.recursiveParameterMap[recursiveKey].parameterSetter = setter;
        this.recursiveParameterOrder.push(recursiveKey);
    }

    protected abstract configureParameterSetters();

    protected abstract runCommand(ctx: HandlerContext): Promise<HandlerResult>;

    private async setNextParameter(ctx: HandlerContext): Promise<HandlerResult> {
        const dynamicClassInstance: any = this;
        for (const recursiveKey of this.recursiveParameterOrder) {
            const propertyKey = this.recursiveParameterMap[recursiveKey].propertyName;
            const propertyValue = dynamicClassInstance[propertyKey];
            if (_.isEmpty(propertyValue)) {
                logger.info(`Setting parameter ${propertyKey}.`);
                const result = await this.recursiveParameterMap[recursiveKey].parameterSetter(ctx, this, this.recursiveParameterMap[recursiveKey].selectionMessage);
                if (result.setterSuccess) {
                    return await this.handle(ctx);
                } else {
                    const displayMessage = this.parameterStatusDisplay.getDisplayMessage(this.getIntent(), this.displayResultMenu);
                    result.messagePrompt.color = "#00a5ff";
                    displayMessage.attachments.push(result.messagePrompt);
                    return await ctx.messageClient.respond(displayMessage, {id: this.messagePresentationCorrelationId});
                }
            }
        }
    }

    private recursiveParametersAreSet(): boolean {
        let parametersAreSet = true;
        const dynamicClassInstance: any = this;
        for (const recursiveKey of this.recursiveParameterList) {

            const propertyKey = this.recursiveParameterMap[recursiveKey].propertyName;
            const propertyValue = dynamicClassInstance[propertyKey];

            if (this.recursiveParameterMap[recursiveKey].parameterSetter === undefined) {
                logger.error(`Setter for recursive parameter ${propertyKey} is not set.`);
                throw new Error(`Setter for recursive parameter ${propertyKey} is not set.`);
            }

            logger.debug(`Recursive Param with recursive key ${recursiveKey} details:\nProperty: ${propertyKey}\nForceSet: ${this.recursiveParameterMap[recursiveKey].forceSet}\nValue: ${dynamicClassInstance[propertyKey]}`);

            if (this.recursiveParameterMap[recursiveKey].forceSet &&
                _.isEmpty(propertyValue)) {
                logger.info(`Recursive parameter ${propertyKey} not set.`);
                parametersAreSet = false;
                break;
            }
        }
        return parametersAreSet;
    }

    private updateParameterStatusDisplayMessage() {
        this.parameterStatusDisplay = new ParameterStatusDisplay();
        const dynamicClassInstance: any = this;
        for (const recursiveKey of this.recursiveParameterOrder) {

            const propertyKey = this.recursiveParameterMap[recursiveKey].propertyName;
            const propertyValue = dynamicClassInstance[propertyKey];

            if (!(_.isEmpty(propertyValue))) {
                this.parameterStatusDisplay.setParam(propertyKey, propertyValue);
            }
        }
    }

    private getIntent(): string {
        const dynamicClassInstance: any = this;
        const intentValue = dynamicClassInstance.__intent;
        if (!_.isEmpty(intentValue)) {
            return intentValue;
        }

        return "Unknown Command";
    }

    private async handleRequestNextParameterError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }
}

export function RecursiveParameter(details: RecursiveParameterDetails) {
    return (target: any, propertyKey: string) => {
        const recursiveParameters: any = {...details};
        if (target instanceof RecursiveParameterRequestCommand) {
            if (recursiveParameters.forceSet === undefined) {
                recursiveParameters.forceSet = true;
            }
            recursiveParameters.required = false;
            recursiveParameters.displayable = false;
            target.addRecursiveParameterProperty(recursiveParameters, propertyKey);
        }
        declareParameter(target, propertyKey, recursiveParameters);
    };
}

export interface RecursiveParameterDetails extends BaseParameter {
    forceSet?: boolean;
    recursiveKey: string;
    selectionMessage?: string;
}

interface RecursiveParameterMapping {
    propertyName: string;
    parameterSetter: (ctx: HandlerContext, commandHandler: HandleCommand, selectionMessage: string) => Promise<RecursiveSetterResult>;
    selectionMessage: string;
    forceSet: boolean;
}

export enum ParameterDisplayType {
    show = "show",
    hide = "hide",
}
