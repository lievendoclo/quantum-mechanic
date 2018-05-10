import {OCCommand} from "./base/OCCommand";
import {OCCommandResult} from "./base/OCCommandResult";
import {SimpleOption} from "./base/options/SimpleOption";
import {StandardOption} from "./base/options/StandardOption";
import {OCCommon} from "./OCCommon";
import {OCPolicy} from "./OCPolicy";

export class OCClient {

    public static policy = OCPolicy;

    public static getInstance(): OCClient {
        if (this.instance === null) {
            this.instance = new OCClient();
        }
        return this.instance;
    }

    public static setInstance(newInstance: OCClient): void {
        this.instance = newInstance;
    }

    public static login(host: string, token: string): Promise<OCCommandResult> {
        return OCClient.getInstance().login(host, token);
    }

    public static logout(): Promise<OCCommandResult> {
        const loginCommand = new OCCommand("logout");
        return loginCommand.execute();
    }

    public static newProject(projectName: string, displayName: string, description: string = ""): Promise<OCCommandResult> {
        return OCClient.getInstance().newProject(projectName, displayName, description);
    }

    public static selectProject(projectName: string): Promise<OCCommandResult> {
        const newProjectCommand = new OCCommand("project", [projectName]);

        return newProjectCommand.execute();
    }

    public static createServiceAccount(serviceAccountName: string) {
        return OCCommon.createStdIn("serviceaccount", [serviceAccountName]);
    }

    public static createPvc(pvcName: string, project: string, size: string = "10Gi", accessModes: string[] = ["ReadWriteMany"]) {
        return OCCommon.createFromData({
            kind: "PersistentVolumeClaim",
            apiVersion: "v1",
            metadata: {
                name: pvcName,
            },
            spec: {
                accessModes,
                resources: {
                    requests: {
                        storage: size,
                    },
                },
            },
        }, [
            new SimpleOption("-namespace", project),
        ]);
    }

    private static instance: OCClient = null;

    public login(host: string, token: string): Promise<OCCommandResult> {
        const loginCommand = new OCCommand("login", [host],
            [
                new StandardOption("token", token, true),
                new StandardOption("insecure-skip-tls-verify", "true"),
            ],
            )
        ;
        return loginCommand.execute();
    }

    public newProject(projectName: string, displayName: string, description: string = ""): Promise<OCCommandResult> {
        const newProjectCommand = new OCCommand("new-project", [projectName],
            [
                new StandardOption("display-name", displayName),
                new StandardOption("description", description),
            ],
        );

        return newProjectCommand.execute();
    }
}
