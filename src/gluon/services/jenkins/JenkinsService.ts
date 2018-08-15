import {logger} from "@atomist/automation-client";
import Axios from "axios";
import {AxiosInstance, AxiosPromise} from "axios-https-proxy-fix";
import * as https from "https";
import * as _ from "lodash";
import * as qs from "query-string";
import * as util from "util";
import {addAxiosLogger} from "../../util/shared/AxiosLogger";
import {QMError} from "../../util/shared/Error";
import {isSuccessCode} from "../../util/shared/Http";
import {retryFunction} from "../../util/shared/RetryFunction";

export class JenkinsService {

    public kickOffFirstBuild(jenkinsHost: string,
                             token: string,
                             gluonProjectName: string,
                             gluonApplicationName: string): AxiosPromise {
        logger.debug(`Trying to kick of first jenkins build. jenkinsHost: ${jenkinsHost}; token: ${token}; gluonProjectName: ${gluonProjectName}; gluonApplicationName: ${gluonApplicationName} `);
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
        logger.debug(`Trying to kick of a jenkins build. jenkinsHost: ${jenkinsHost}; token: ${token}; gluonProjectName: ${gluonProjectName}; gluonApplicationName: ${gluonApplicationName} `);
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
        logger.debug(`Trying to create jenkins global credentials. jenkinsHost: ${jenkinsHost}; token: ${token}; gluonProjectId: ${gluonProjectId}`);
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
        logger.debug(`Trying to create jenkins global credentials from gile. jenkinsHost: ${jenkinsHost}; token: ${token}; gluonProjectId: ${gluonProjectId}; filePath: ${filePath}; fileName: ${fileName}`);
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
        logger.debug(`Trying to create jenkins job. jenkinsHost: ${jenkinsHost}; token: ${token}; gluonProjectName: ${gluonProjectName}; gluonApplicationName: ${gluonApplicationName}`);
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
        logger.debug(`Trying to create jenkins openshift credentials. jenkinsHost: ${jenkinsHost}; token: ${token}; gluonProjectName: ${gluonProjectName}`);
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

    public async createJenkinsCredentialsWithRetries(retryAttempts: number, intervalTime: number, jenkinsHost: string,
                                                     token: string, gluonProjectId: string, jenkinsCredentials, fileDetails: { fileName: string, filePath: string } = null) {
        const maxRetries = retryAttempts;
        const waitTime = intervalTime;
        const result = await retryFunction(maxRetries, waitTime, async (attemptNumber: number) => {
            logger.warn(`Trying to create jenkins credentials. Attempt number ${attemptNumber}.`);
            try {
                let createCredentialsResult;
                if (fileDetails === null) {
                    createCredentialsResult = await this.createGlobalCredentials(jenkinsHost, token, gluonProjectId, jenkinsCredentials);
                } else {
                    createCredentialsResult = await this.createGlobalCredentialsWithFile(jenkinsHost, token, gluonProjectId, jenkinsCredentials, fileDetails.filePath, fileDetails.fileName);
                }

                if (!isSuccessCode(createCredentialsResult.status)) {
                    logger.warn("Failed to create jenkins credentials.");
                    if (attemptNumber < maxRetries) {
                        logger.warn(`Waiting to retry again in ${waitTime}ms...`);
                    }
                    return false;
                }

                return true;
            } catch (error) {
                logger.warn(`Failed to create jenkins credentials. Error: ${util.inspect(error)}`);
                if (attemptNumber < maxRetries) {
                    logger.warn(`Waiting to retry again in ${waitTime}ms...`);
                }
                return false;
            }
        });

        if (!result) {
            throw new QMError("Failed to create jenkins credentials. Instance was non responsive.");
        }
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
