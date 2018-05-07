import {OCCommand} from "./base/OCCommand";
import {OCCommandResult} from "./base/OCCommandResult";
import {AbstractOption} from "./base/options/AbstractOption";
import {StandardOption} from "./base/options/StandardOption";

export class OCPolicy {

    public static getInstance(): OCPolicy {
        if (this.instance === null) {
            this.instance = new OCPolicy();
        }
        return this.instance;
    }

    public static setInstance(newInstance: OCPolicy): void {
        this.instance = newInstance;
    }

    public static policyCommand(command: string, parameters: string[] = [],
                                options: AbstractOption[] = []): Promise<OCCommandResult> {
        return OCPolicy.getInstance().policyCommand(command, parameters, options);
    }

    public static addRoleToUser(username: string, role: string, namespace: string, parameters: string[] = [],
                                options: AbstractOption[] = []): Promise<OCCommandResult> {
        return OCPolicy.getInstance().addRoleToUser(username, role, namespace, parameters, options);
    }

    public static addRoleToServiceAccount(owningProject: string,
                                          serviceAccountName: string,
                                          role: string,
                                          namespace: string,
                                          parameters: string[] = [],
                                          options: AbstractOption[] = []): Promise<OCCommandResult> {
        return this.addRoleToUser(`system:serviceaccount:${owningProject}:${serviceAccountName}`,
            role, namespace, parameters, options);
    }

    private static instance: OCPolicy;

    public policyCommand(command: string, parameters: string[] = [],
                         options: AbstractOption[] = []): Promise<OCCommandResult> {
        const commandCommandInstance = new OCCommand(`policy ${command}`, parameters,
            options,
        );
        return commandCommandInstance.execute();
    }

    public addRoleToUser(username: string, role: string, namespace: string, parameters: string[] = [],
                         options: AbstractOption[] = []): Promise<OCCommandResult> {
        return this.policyCommand("add-role-to-user", [role, username].concat(parameters),
            [new StandardOption("namespace", namespace)].concat(options));
    }

}
