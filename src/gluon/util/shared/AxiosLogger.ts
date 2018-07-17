import {logger} from "@atomist/automation-client";
import {AxiosInstance} from "axios-https-proxy-fix";

export function addAxiosLogger(instance: AxiosInstance, descriptor: string): AxiosInstance {
    instance.interceptors.request.use(request => {
        if (request.proxy !== false) {
            logger.debug("Proxy: " + request.proxy);
        }
        logger.debug(`=> ${descriptor} ${request.method} ${request.url} ${JSON.stringify(request.data)}`);
        return request;
    });

    instance.interceptors.response.use(response => {
        logger.debug(`<= ${descriptor} ${response.status} ${response.request.url} ${JSON.stringify(response.data)}`);
        return response;
    }, error => {
        if (error.response) {
            logger.debug(`<= ${descriptor} ${error.response.status} ${error.response.request.url} ${JSON.stringify(error.response.data)}`);
        } else {
            logger.debug(`<= ${descriptor} ${error}`);
        }
        return error.response;
    });
    return instance;
}
