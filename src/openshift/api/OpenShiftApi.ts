import {AxiosResponse} from "axios";
import {OpenShiftApiElement} from "./base/OpenShiftApiElement";
import {OpenShiftConfigContract} from "./base/OpenShiftConfigContract";
import {OpenShiftApiAdm} from "./OpenShiftApiAdm";
import {OpenShiftApiCreate} from "./OpenShiftApiCreate";
import {OpenShiftApiGet} from "./OpenShiftApiGet";
import {OpenShiftApiPolicy} from "./OpenShiftApiPolicy";
import {OpenshiftResource} from "./resources/OpenshiftResource";
import {ResourceFactory} from "./resources/ResourceFactory";

export class OpenShiftApi extends OpenShiftApiElement {

    public get: OpenShiftApiGet;
    public create: OpenShiftApiCreate;
    public policy: OpenShiftApiPolicy;
    public adm: OpenShiftApiAdm;

    constructor(
        openshiftConfig: OpenShiftConfigContract,
    ) {
        super(openshiftConfig);
        this.get = new OpenShiftApiGet(openshiftConfig);
        this.create = new OpenShiftApiCreate(openshiftConfig);
        this.policy = new OpenShiftApiPolicy(openshiftConfig);
        this.adm = new OpenShiftApiAdm(openshiftConfig);
    }

    public newProject(projectName: string,
                      projectDisplayName: string,
                      projectDescription: string): Promise<AxiosResponse> {
        return this.newProjectFromResource(
            ResourceFactory.projectResource(projectName, projectDisplayName, projectDescription));
    }

    public newProjectFromResource(projectResource: OpenshiftResource): Promise<AxiosResponse> {
        const instance = this.getAxiosInstanceOApi();
        return instance.post("projectrequests", projectResource);
    }

}
