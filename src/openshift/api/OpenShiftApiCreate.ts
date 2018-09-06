import {logger} from "@atomist/automation-client";
import {isSuccessCode} from "../../http/Http";
import {OpenShiftApiElement} from "./base/OpenShiftApiElement";
import {OpenshiftApiResult} from "./base/OpenshiftApiResult";
import {OpenshiftResource} from "./resources/OpenshiftResource";
import {ResourceFactory} from "./resources/ResourceFactory";
import {ResourceUrl} from "./resources/ResourceUrl";

export class OpenShiftApiCreate extends OpenShiftApiElement {

    public serviceAccount(serviceAccountName: string, namespace: string): Promise<OpenshiftApiResult> {
        return this.create(
            ResourceFactory.serviceAccountResource(serviceAccountName),
            namespace,
        );
    }

    public async create(resource: OpenshiftResource, namespace: string = "default", apply = false): Promise<OpenshiftApiResult> {
        logger.info(`Creating resource ${resource.kind} in ${namespace}`);
        if (apply) {
            return await this.apply(resource, namespace);
        }
        if (resource.kind === "List") {
            return await this.processList(resource, namespace, CreateType.create);
        }

        delete resource.metadata.uid;
        delete resource.metadata.resourceVersion;

        const instance = this.getAxiosInstanceForResource(resource);
        const url = ResourceUrl.getResourceKindUrl(resource, namespace);
        return await instance.post(url, resource);
    }

    public async apply(resource: OpenshiftResource, namespace: string = "default"): Promise<OpenshiftApiResult> {
        logger.info(`Applying resource ${resource.kind} in ${namespace}`);
        if (resource.kind === "List") {
            return await this.processList(resource, namespace, CreateType.apply);
        }
        const instance = this.getAxiosInstanceForResource(resource);
        const namedUrl = ResourceUrl.getNamedResourceUrl(resource, namespace);
        const exists = await instance.get(namedUrl);
        if (isSuccessCode(exists.status)) {
            return exists;
        }

        return this.create(resource, namespace);
    }

    public async replace(resource: OpenshiftResource, namespace: string = "default"): Promise<OpenshiftApiResult> {
        logger.info(`Replacing resource ${resource.kind} in ${namespace}`);
        if (resource.kind === "List") {
            return await this.processList(resource, namespace, CreateType.replace);
        }

        delete resource.metadata.uid;
        delete resource.metadata.resourceVersion;

        const instance = this.getAxiosInstanceForResource(resource);
        const namedUrl = ResourceUrl.getNamedResourceUrl(resource, namespace);
        const exists = await instance.get(namedUrl);
        if (isSuccessCode(exists.status)) {
            logger.info("Updating resource: " + namedUrl);
            if (exists.data.metadata.uid !== undefined) {
                resource.metadata.uid = exists.data.metadata.uid;
            }
            if (exists.data.metadata.resourceVersion !== undefined) {
                resource.metadata.resourceVersion = exists.data.metadata.resourceVersion;
            }
            return await instance.put(namedUrl, resource);
        }

        const url = ResourceUrl.getResourceKindUrl(resource, namespace);
        return await instance.post(url, resource);
    }

    private async processList(resource: OpenshiftResource, namespace: string, createType: CreateType): Promise<OpenshiftApiResult> {
        let status = 200;
        const result = {
            items: [],
        };
        for (const item of resource.items) {
            let createResult;
            if (createType === CreateType.replace) {
                createResult = await this.replace(item, namespace);
            } else if (createType === CreateType.create) {
                createResult = await this.create(item, namespace);
            } else {
                createResult = await this.apply(item, namespace);
            }
            if (isSuccessCode(createResult.status)) {
                result.items.push(
                    {
                        data: createResult.data,
                        status: createResult.status,
                    },
                );
            } else {
                result.items.push(
                    {
                        data: createResult,
                        status: createResult.status,
                    },
                );
                status = 400;
            }
        }
        return {
            data: result,
            status,
        };
    }

}

enum CreateType {
    create = "create",
    apply = "apply",
    replace = "replace",
}
