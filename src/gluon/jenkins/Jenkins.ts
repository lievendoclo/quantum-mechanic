import {logger} from "@atomist/automation-client";
import axios from "axios";
import {AxiosPromise} from "axios-https-proxy-fix";
import * as https from "https";
import * as _ from "lodash";
import * as qs from "query-string";

export function kickOffFirstBuild(jenkinsHost: string,
                                  token: string,
                                  gluonProjectName: string,
                                  gluonApplicationName: string): AxiosPromise {
    const jenkinsAxios = axios.create({
        httpsAgent: new https.Agent({
            rejectUnauthorized: false,
        }),
    });

    return jenkinsAxios.post(`https://${jenkinsHost}/job/${_.kebabCase(gluonProjectName).toLowerCase()}/job/${_.kebabCase(gluonApplicationName).toLowerCase()}/build?delay=0sec`,
        "", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
}

export function kickOffBuild(jenkinsHost: string,
                             token: string,
                             gluonProjectName: string,
                             gluonApplicationName: string): AxiosPromise {
    const jenkinsAxios = axios.create({
        httpsAgent: new https.Agent({
            rejectUnauthorized: false,
        }),
    });

    return jenkinsAxios.post(`https://${jenkinsHost}/job/${_.kebabCase(gluonProjectName).toLowerCase()}/job/${_.kebabCase(gluonApplicationName).toLowerCase()}/job/master/build?delay=0sec`,
        "", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
}

export function createGlobalCredentials(jenkinsHost: string,
                                        token: string,
                                        gluonProjectId: string,
                                        jenkinsCredentials: any): AxiosPromise {
    const jenkinsAxios = axios.create({
        httpsAgent: new https.Agent({
            rejectUnauthorized: false,
        }),
    });

    jenkinsAxios.interceptors.request.use(request => {
        if (request.data && (request.headers["Content-Type"].indexOf("application/x-www-form-urlencoded") !== -1)) {
            logger.debug(`Stringifying URL encoded data: ${qs.stringify(request.data)}`);
            request.data = qs.stringify(request.data);
        }
        return request;
    });

    return jenkinsAxios.post(`https://${jenkinsHost}/credentials/store/system/domain/_/createCredentials`,
        {
            json: `${JSON.stringify(jenkinsCredentials)}`,
        },
        {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "Authorization": `Bearer ${token}`,
            },
        });
}

export function createGlobalCredentialsWithFile(jenkinsHost: string,
                                                token: string,
                                                gluonProjectId: string,
                                                jenkinsCredentials: any,
                                                filePath: string,
                                                fileName: string): AxiosPromise {
    const FormData = require("form-data");
    const fs = require("fs");

    const form = new FormData();
    form.append("json", JSON.stringify(jenkinsCredentials));
    form.append("file", fs.createReadStream(filePath), fileName);

    const jenkinsAxios = axios.create({
        httpsAgent: new https.Agent({
            rejectUnauthorized: false,
        }),
    });

    return jenkinsAxios.post(`https://${jenkinsHost}/credentials/store/system/domain/_/createCredentials`,
        form,
        {
            headers: {
                "Content-Type": `multipart/form-data; boundary=${form._boundary}`,
                "Authorization": `Bearer ${token}`,
            },
        });
}
