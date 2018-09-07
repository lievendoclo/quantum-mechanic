import {isSuccessCode} from "../../http/Http";
import {OpenShiftApiElement} from "./base/OpenShiftApiElement";
import {OpenshiftApiResult} from "./base/OpenshiftApiResult";
import {ResourceUrl} from "./resources/ResourceUrl";

export class OpenShiftApiAdm extends OpenShiftApiElement {

    public async podNetworkJoinToProject(projectToJoin: string, projectToJoinTo: string): Promise<OpenshiftApiResult> {
        const clusterNetworkResource = {
            kind: "ClusterNetwork",
            apiVersion: "v1",
            metadata: {
                name: "default",
            },
        };
        let instance = this.getAxiosInstanceForResource(clusterNetworkResource);
        const checkForSupportUrl = ResourceUrl.getNamedResourceUrl(clusterNetworkResource);
        const supported = await instance.get(checkForSupportUrl);
        if (!isSuccessCode(supported.status)) {
            return supported;
        }

        const netNamespaceResource = {
            kind: "NetNamespace",
            apiVersion: "v1",
            metadata: {
                name: projectToJoin,
            },
        };
        instance = this.getAxiosInstanceForResource(netNamespaceResource);
        const projectNetNamespaceUrl = ResourceUrl.getNamedResourceUrl(netNamespaceResource);
        const netNamespaceExists = await instance.get(projectNetNamespaceUrl);
        if (!isSuccessCode(netNamespaceExists.status)) {
            return netNamespaceExists;
        }

        const netNamespace = netNamespaceExists.data;

        if (netNamespace.metadata.annotations === undefined) {
            netNamespace.metadata.annotations = {} as { [key: string]: string };
        }

        netNamespace.metadata.annotations["pod.network.openshift.io/multitenant.change-network"] = `join:${projectToJoinTo}`;

        return await instance.put(projectNetNamespaceUrl, netNamespace);

    }

}
