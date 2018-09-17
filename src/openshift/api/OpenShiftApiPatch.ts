import {logger} from "@atomist/automation-client";
import {OpenShiftApiElement} from "./base/OpenShiftApiElement";
import {OpenshiftApiResult} from "./base/OpenshiftApiResult";
import {OpenshiftResource} from "./resources/OpenshiftResource";
import {ResourceUrl} from "./resources/ResourceUrl";

export class OpenShiftApiPatch extends OpenShiftApiElement {

    public async patch(resource: OpenshiftResource, namespace: string = "default"): Promise<OpenshiftApiResult> {
        logger.info(`Patching resource ${resource.kind} in ${namespace}`);

        const instance = this.getAxiosInstanceForResource(resource);
        const url = ResourceUrl.getNamedResourceUrl(resource, namespace);

        delete resource.metadata;
        delete resource.kind;
        delete resource.apiVersion;

        return await instance.patch(url, resource, {
            headers: {
                "Content-Type": "application/strategic-merge-patch+json",
            },
        });
    }

}
