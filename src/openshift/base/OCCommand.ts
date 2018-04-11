import {logger} from "@atomist/automation-client";
import {CommandLineElement} from "./CommandLineElement";
import {OCCommandResult} from "./OCCommandResult";
import {AbstractOption} from "./options/AbstractOption";

export class OCCommand implements CommandLineElement {

    constructor(protected command: string,
                protected parameters: string[] = [],
                protected options: AbstractOption[] = []) {

    }

    public buildDisplayCommand(): string {
        let commandString = this.buildBaseCommand();
        for (const option of this.options) {
            if (option) {
                commandString += `${option.buildDisplayCommand()} `;
            }
        }

        return commandString;
    }

    public execute(): Promise<OCCommandResult> {
        const command = this.build();

        return new Promise((resolve, reject) => {
            logger.verbose(`Executing oc command sync: ${command}`);
            try {
                let execution: Buffer;
                execution = require("child_process").execSync(command);
                const response = new OCCommandResult();
                response.command = this.buildDisplayCommand();
                response.output = execution.toString();
                response.status = true;

                logger.debug(`OpenShift client response: ${JSON.stringify(response)}`);
                return resolve(response);
            } catch (error) {
                const response = new OCCommandResult();
                response.command = this.buildDisplayCommand();
                response.code = error.status;
                response.status = false;
                response.error = error.stderr.toString();

                logger.error(`OpenShift client error response: ${JSON.stringify(response)}`);
                return reject(response);
            }
        });
    }

    public executeAsync(): Promise<OCCommandResult> {
        const command = this.build();

        return new Promise((resolve, reject) => {
            logger.verbose(`Executing oc command async: ${command}`);
            require("child-process-promise").exec(command)
                .then(result => {
                    const response = new OCCommandResult();
                    response.command = this.buildDisplayCommand();
                    response.output = result.stdout;
                    response.status = true;

                    logger.debug(`OpenShift client response: ${JSON.stringify(response)}`);
                    return resolve(response);
                })
                .catch(error => {
                    const response = new OCCommandResult();
                    response.command = this.buildDisplayCommand();
                    response.code = error.status;
                    response.status = false;
                    response.error = error.stderr.toString();

                    logger.error(`OpenShift client error response: ${JSON.stringify(response)}`);
                    return reject(response);
                });
        });
    }

    public build(): string {
        let commandString = this.buildBaseCommand();
        for (const option of this.options) {
            if (option) {
                commandString += `${option.build()} `;
            }
        }

        return commandString;
    }

    private buildBaseCommand() {
        let commandString = `oc ${this.command} `;
        for (const param of this.parameters) {
            commandString += `"${param}" `;
        }
        return commandString;
    }

}
