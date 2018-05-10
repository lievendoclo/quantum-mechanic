import {logger} from "@atomist/automation-client";
import * as fs from "fs";
import {OCCommand} from "./base/OCCommand";
import {OCCommandResult} from "./base/OCCommandResult";
import {AbstractOption} from "./base/options/AbstractOption";
import {SimpleOption} from "./base/options/SimpleOption";
import {StandardOption} from "./base/options/StandardOption";

export class OCCommon {

    public static getInstance(): OCCommon {
        if (this.instance === null) {
            this.instance = new OCCommon();
        }
        return this.instance;
    }

    public static setInstance(newInstance: OCCommon): void {
        this.instance = newInstance;
    }

    public static commonCommand(command: string, type: string, parameters: string[] = [],
                                options: AbstractOption[] = [], useAsync = false): Promise<OCCommandResult> {
        return OCCommon.getInstance().commonCommand(command, type, parameters, options, useAsync);
    }

    public static createStdIn(type: string, parameters: string[] = [],
                              options: AbstractOption[] = []) {
        return OCCommon.getInstance().createStdIn(type, parameters, options);
    }

    public static createFromFile(fileName: string,
                                 options: AbstractOption[] = [],
                                 applyNotReplace: boolean = false): Promise<OCCommandResult> {
        return OCCommon.getInstance().createFromFile(fileName, options, applyNotReplace);
    }

    public static createFromData(data: any,
                                 options: AbstractOption[] = [],
                                 applyNotReplace: boolean = false): Promise<OCCommandResult> {
        return OCCommon.getInstance().createFromData(data, options, applyNotReplace);
    }

    public static deleteCommand(type: string, parameters: string[] = [],
                                options: AbstractOption[] = []): Promise<OCCommandResult> {
        return this.commonCommand("delete", type, parameters, options);
    }

    private static instance: OCCommon = null;

    public commonCommand(command: string, type: string, parameters: string[] = [],
                         options: AbstractOption[] = [], useAsync = false): Promise<OCCommandResult> {
        const commandCommandInstance = new OCCommand(`${command} ${type}`, parameters,
            options,
        );
        if (useAsync === true) {
            return commandCommandInstance.executeAsync();
        } else {
            return commandCommandInstance.execute();
        }
    }

    public createStdIn(type: string, parameters: string[] = [],
                       options: AbstractOption[] = []) {
        return this.commonCommand("apply", type, parameters, options);
    }

    public createFromFile(fileName: string,
                          options: AbstractOption[] = [],
                          applyNotReplace: boolean = false): Promise<OCCommandResult> {
        const createFromFileCommand = new OCCommand(
            applyNotReplace ? "apply" : "replace",
            [],
            [
                new SimpleOption("f", fileName),
                applyNotReplace ? null : new StandardOption("force"),
            ].concat(options),
        );
        return createFromFileCommand.execute();
    }

    public createFromData(data: any,
                          options: AbstractOption[] = [],
                          applyNotReplace: boolean = false): Promise<OCCommandResult> {
        const fileName = Date.now() + ".json";
        fs.writeFileSync(`/tmp/${fileName}`, JSON.stringify(data));
        return OCCommon.createFromFile(`/tmp/${fileName}`, options, applyNotReplace).then(
            result => {
                logger.debug(`Resource created: ${JSON.stringify(result)}`);
                // fs.unlinkSync(fileName);
                return Promise.resolve(result);
            },
            result => {
                logger.error(`Resource not created: ${JSON.stringify(result)}`);
                // fs.unlinkSync(fileName);
                return Promise.reject(result);
            },
        );
    }
}
