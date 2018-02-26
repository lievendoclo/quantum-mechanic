import {OCCommand} from "./base/OCCommand";
import {OCCommandResult} from "./base/OCCommandResult";
import {StandardOption} from "./base/options/StandardOption";
import {OCCommon} from "./OCCommon";
import {OCPolicy} from "./OCPolicy";

export class OCClient {

    public static policy = OCPolicy;

    public static login(host: string, token: string): Promise<OCCommandResult> {
        const loginCommand = new OCCommand("login", [host],
            [
                new StandardOption("token", token, true),
                new StandardOption("insecure-skip-tls-verify", "true"),
            ],
            )
        ;
        return loginCommand.execute();
    }

    public static logout(): Promise<OCCommandResult> {
        const loginCommand = new OCCommand("logout");
        return loginCommand.execute();
    }

    public static newProject(projectName: string, displayName: string, description: string = ""): Promise<OCCommandResult> {
        const newProjectCommand = new OCCommand("new-project", [projectName],
            [
                new StandardOption("display-name", displayName),
                new StandardOption("description", description),
            ],
        );

        return newProjectCommand.execute();
    }

    public static selectProject(projectName: string): Promise<OCCommandResult> {
        const newProjectCommand = new OCCommand("project", [projectName]);

        return newProjectCommand.execute();
    }

    public static createServiceAccount(serviceAccountName: string) {
        return OCCommon.createStdIn("serviceaccount", [serviceAccountName]);
    }
}
