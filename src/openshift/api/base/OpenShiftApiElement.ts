import Axios from "axios-https-proxy-fix";
import https = require("https");
import _ = require("lodash");
import {AwaitAxios} from "../../../http/AwaitAxios";
import {OpenshiftResource} from "../resources/OpenshiftResource";
import {ResourceUrl} from "../resources/ResourceUrl";
import {OpenshiftApiBaseRoute} from "./OpenshiftApiBaseRoute";
import {OpenShiftConfigContract} from "./OpenShiftConfigContract";

export abstract class OpenShiftApiElement {

    protected constructor(protected openShiftConfig: OpenShiftConfigContract) {
    }

    protected getAxiosInstanceOApi(resourceApi: string = "v1"): AwaitAxios {
        const instance = Axios.create({
            baseURL: `${this.openShiftConfig.masterUrl}/oapi/${resourceApi}/`,
            httpsAgent: new https.Agent({
                rejectUnauthorized: false,
            }),
        });
        instance.defaults.headers.common.Authorization = "bearer " + this.openShiftConfig.auth.token;
        return new AwaitAxios(instance);
    }

    protected getAxiosInstanceApi(resourceApi: string = "v1"): AwaitAxios {
        let baseApi = "apis";
        if (resourceApi === "v1") {
            baseApi = "api";
        }
        const instance = Axios.create({
            baseURL: `${this.openShiftConfig.masterUrl}/${baseApi}/${resourceApi}/`,
            httpsAgent: new https.Agent({
                rejectUnauthorized: false,
            }),
        });
        instance.defaults.headers.common.Authorization = "bearer " + this.openShiftConfig.auth.token;
        return new AwaitAxios(instance);
    }

    protected getAxiosInstanceForResource(resource: OpenshiftResource) {
        if (_.isEmpty(resource.apiVersion)) {
            resource.apiVersion = "v1";
        }
        if (ResourceUrl.getResourceApi(resource) === OpenshiftApiBaseRoute.API) {
            return this.getAxiosInstanceApi(resource.apiVersion);
        } else {
            return this.getAxiosInstanceOApi(resource.apiVersion);
        }
    }

}
