import {GenericResource} from "./GenericResource";
import {OpenshiftResource} from "./OpenshiftResource";

export class ResourceFactory {
    public static baseResource(kind: string, apiVersion: string = "v1"): OpenshiftResource {
        return {
            kind,
            apiVersion,
            metadata: {},
        };
    }

    public static projectResource(projectName: string,
                                  projectDisplayName: string,
                                  description: string): OpenshiftResource {
        const baseResource = ResourceFactory.baseResource("ProjectRequest");
        baseResource.metadata = {
            name: projectName,
            creationTimestamp: null,
        };
        baseResource.displayName = projectDisplayName;
        baseResource.description = description;
        return baseResource;
    }

    public static roleBindingResource(namespace: string, role: string, username: string): OpenshiftResource {
        const baseResource = ResourceFactory.baseResource("RoleBinding");
        baseResource.metadata = {
            name: role,
            namespace,
            creationTimestamp: null,
        };
        baseResource.userNames = [username];
        baseResource.subjects = [];
        baseResource.roleRef = {
            name: role,
        };
        return baseResource;
    }

    public static userRoleBindingResource(namespace: string, role: string, username: string): OpenshiftResource {
        const baseResource = ResourceFactory.roleBindingResource(namespace, role, username);
        baseResource.subjects.push(
            {
                kind: "User",
                name: username,
            },
        );
        return baseResource;
    }

    public static serviceAccountRoleBindingResource(namespace: string, role: string,
                                                    serviceAccount: string): OpenshiftResource {
        const baseResource = ResourceFactory.roleBindingResource(namespace, role,
            `system:serviceaccount:${namespace}:${serviceAccount}`);
        baseResource.subjects.push(
            {
                kind: "User",
                namespace,
                name: serviceAccount,
            },
        );
        return baseResource;
    }

    public static convertToOpenshiftResource(resource: GenericResource, kind: string = ""): OpenshiftResource {
        const newResource: GenericResource = JSON.parse(JSON.stringify(resource));
        newResource.kind = kind;
        newResource.apiVersion = "v1";
        if (!newResource.hasOwnProperty("metadata")) {
            newResource.metadata = {};
        }
        return newResource as OpenshiftResource;
    }

    public static serviceAccountResource(serviceAccountName: string): OpenshiftResource {
        const baseResource = ResourceFactory.baseResource("ServiceAccount");
        baseResource.metadata = {
            name: serviceAccountName,
            creationTimestamp: null,
        };
        return baseResource;
    }

    public static resourceList(): OpenshiftResource {
        const baseResource = ResourceFactory.baseResource("List");
        baseResource.items = [];
        return baseResource;
    }

}
