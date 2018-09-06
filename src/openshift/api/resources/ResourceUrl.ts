import _ = require("lodash");
import {OpenshiftApiBaseRoute} from "../base/OpenshiftApiBaseRoute";
import {OpenshiftResource} from "./OpenshiftResource";

export class ResourceUrl {

    public static getResourceKindUrl(resource: OpenshiftResource, namespace: string = ""): string {
        const resourceKind = resource.kind.toLowerCase();
        let url: string;
        if (ResourceUrl.urlMap.hasOwnProperty(resourceKind)) {
            const urlDetails = ResourceUrl.urlMap[resourceKind];
            url = `${resourceKind}s`;
            for (const urlDetail of urlDetails) {
                if (urlDetail.apiVersion === resource.apiVersion) {
                    url = urlDetail.url;
                    break;
                }
            }
            url = processNamespacingForUrl(url, namespace);
        } else {
            url = processNamespacingForUrl(`${resourceKind}s`, namespace);
        }
        return url;
    }

    public static getNamedResourceUrl(resource: OpenshiftResource, namespace: string = "") {
        return ResourceUrl.getResourceKindUrl(resource, namespace) + `/${resource.metadata.name}`;
    }

    public static getResourceApi(resource: OpenshiftResource): OpenshiftApiBaseRoute {
        const resourceKind = resource.kind.toLowerCase();
        let api: OpenshiftApiBaseRoute;
        if (ResourceUrl.urlMap.hasOwnProperty(resourceKind)) {
            const urlDetails = ResourceUrl.urlMap[resourceKind];
            api = OpenshiftApiBaseRoute.API;
            for (const urlDetail of urlDetails) {
                if (urlDetail.apiVersion === resource.apiVersion) {
                    api = urlDetail.api;
                    break;
                }
            }
        } else {
            api = OpenshiftApiBaseRoute.API;
        }
        return api;
    }

    private static urlMap: UrlMap = {
        user: [
            {
                apiVersion: "v1",
                url: "users",
                api: OpenshiftApiBaseRoute.OAPI,
            },
        ],
        imagestream: [
            {
                apiVersion: "v1",
                url: "imagestreams",
                api: OpenshiftApiBaseRoute.OAPI,
            },
        ],
        imagestreamtag: [
            {
                apiVersion: "v1",
                url: "imagestreamtags",
                api: OpenshiftApiBaseRoute.OAPI,
            },
        ],
        buildconfig: [
            {
                apiVersion: "v1",
                url: "buildconfigs",
                api: OpenshiftApiBaseRoute.OAPI,
            },
        ],
        deploymentconfig: [
            {
                apiVersion: "v1",
                url: "deploymentconfigs",
                api: OpenshiftApiBaseRoute.OAPI,
            },
        ],
        route: [
            {
                apiVersion: "v1",
                url: "routes",
                api: OpenshiftApiBaseRoute.OAPI,
            },
        ],
        rolebinding: [
            {
                apiVersion: "v1",
                url: "rolebindings",
                api: OpenshiftApiBaseRoute.OAPI,
            }, {
                apiVersion: "rbac.authorization.k8s.io/v1beta1",
                url: "rolebindings",
                api: OpenshiftApiBaseRoute.API,
            },
        ],
    };
}

function processNamespacingForUrl(urlCore: string, namespace: string): string {
    let url: string = urlCore;
    if (!_.isEmpty(namespace)) {
        url = `namespaces/${namespace}/${urlCore}`;
    }
    return url;
}

interface UrlMap {
    [key: string]: UrlDetail[];
}

interface UrlDetail {
    apiVersion: string;
    url: string;
    api: OpenshiftApiBaseRoute;
}
