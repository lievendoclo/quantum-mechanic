import {logger} from "@atomist/automation-client";
import Axios from "axios";
import {AxiosInstance, AxiosPromise} from "axios-https-proxy-fix";
import * as https from "https";
import * as _ from "lodash";
import * as qs from "query-string";
import {addAxiosLogger} from "../shared/axiosLogger";

export class JenkinsService {
    public kickOffFirstBuild(jenkinsHost: string,
                             token: string,
                             gluonProjectName: string,
                             gluonApplicationName: string): AxiosPromise {
        const axios = jenkinsAxios();
        return axios.post(`https://${jenkinsHost}/job/${_.kebabCase(gluonProjectName).toLowerCase()}/job/${_.kebabCase(gluonApplicationName).toLowerCase()}/build?delay=0sec`,
            "", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
    }

    public kickOffBuild(jenkinsHost: string,
                        token: string,
                        gluonProjectName: string,
                        gluonApplicationName: string): AxiosPromise {
        const axios = jenkinsAxios();
        return axios.post(`https://${jenkinsHost}/job/${_.kebabCase(gluonProjectName).toLowerCase()}/job/${_.kebabCase(gluonApplicationName).toLowerCase()}/job/master/build?delay=0sec`,
            "", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
    }

    public createGlobalCredentials(jenkinsHost: string,
                                   token: string,
                                   gluonProjectId: string,
                                   jenkinsCredentials: any): AxiosPromise {
        const axios = jenkinsAxios();
        axios.interceptors.request.use(request => {
            if (request.data && (request.headers["Content-Type"].indexOf("application/x-www-form-urlencoded") !== -1)) {
                logger.debug(`Stringifying URL encoded data: ${qs.stringify(request.data)}`);
                request.data = qs.stringify(request.data);
            }
            return request;
        });

        return axios.post(`https://${jenkinsHost}/credentials/store/system/domain/_/createCredentials`,
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

    public createGlobalCredentialsWithFile(jenkinsHost: string,
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

        const axios = jenkinsAxios();
        return axios.post(`https://${jenkinsHost}/credentials/store/system/domain/_/createCredentials`,
            form,
            {
                headers: {
                    "Content-Type": `multipart/form-data; boundary=${form._boundary}`,
                    "Authorization": `Bearer ${token}`,
                },
            });
    }

    public async createJenkinsJob(jenkinsHost: string, token: string, gluonProjectName: string, gluonApplicationName, jobConfig: string): Promise<any> {
        const axios = jenkinsAxios();
        return await axios.post(`https://${jenkinsHost}/job/${_.kebabCase(gluonProjectName).toLowerCase()}/createItem?name=${_.kebabCase(gluonApplicationName).toLowerCase()}`,
            jobConfig,
            {
                headers: {
                    "Content-Type": "application/xml",
                    "Authorization": `Bearer ${token}`,
                },
            });
    }

    public async createOpenshiftEnvironmentCredentials(jenkinsHost: string, token: string, gluonProjectName: string, credentialsConfig: string): Promise<any> {
        const axios = jenkinsAxios();
        return await axios.post(`https://${jenkinsHost}/createItem?name=${_.kebabCase(gluonProjectName).toLowerCase()}`,
            credentialsConfig,
            {
                headers: {
                    "Content-Type": "application/xml",
                    "Authorization": `Bearer ${token}`,
                },
            });
    }
}

function jenkinsAxios(): AxiosInstance {
    const instance = Axios.create({
        httpsAgent: new https.Agent({
            rejectUnauthorized: false,
        }),
        timeout: 45000,
        proxy: false,
    });
    return addAxiosLogger(instance, "Jenkins");
}
