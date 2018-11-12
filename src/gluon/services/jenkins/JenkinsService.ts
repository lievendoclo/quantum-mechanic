import {logger} from "@atomist/automation-client";
import Axios from "axios";
import {AxiosInstance} from "axios-https-proxy-fix";
import * as https from "https";
import * as _ from "lodash";
import * as qs from "query-string";
import * as util from "util";
import {addAxiosLogger} from "../../../http/AxiosLogger";
import {isSuccessCode} from "../../../http/Http";
import {QMError} from "../../util/shared/Error";
import {retryFunction} from "../../util/shared/RetryFunction";

export class JenkinsService {

    public async kickOffFirstBuild(jenkinsHost: string,
                                   token: string,
                                   gluonProjectName: string,
                                   gluonApplicationName: string) {
        logger.debug(`Trying to kick of first jenkins build. jenkinsHost: ${jenkinsHost}; token: ${token}; gluonProjectName: ${gluonProjectName}; gluonApplicationName: ${gluonApplicationName} `);
        return await this.genericJenkinsPost(
            `https://${jenkinsHost}/job/${_.kebabCase(gluonProjectName).toLowerCase()}/job/${_.kebabCase(gluonApplicationName).toLowerCase()}/build?delay=0sec`,
            "",
            token,
        );
    }

    public async kickOffBuild(jenkinsHost: string,
                              token: string,
                              gluonProjectName: string,
                              gluonApplicationName: string) {
        logger.debug(`Trying to kick of a jenkins build. jenkinsHost: ${jenkinsHost}; token: ${token}; gluonProjectName: ${gluonProjectName}; gluonApplicationName: ${gluonApplicationName} `);

        return await this.genericJenkinsPost(
            `https://${jenkinsHost}/job/${_.kebabCase(gluonProjectName).toLowerCase()}/job/${_.kebabCase(gluonApplicationName).toLowerCase()}/job/master/build?delay=0sec`,
            "",
            token,
        );
    }

    public async createGlobalCredentials(jenkinsHost: string,
                                         token: string,
                                         jenkinsCredentials: any) {
        logger.debug(`Trying to create jenkins global credentials. jenkinsHost: ${jenkinsHost}; token: ${token}`);
        const axios = jenkinsAxios();
        addXmlFormEncodedStringifyAxiosIntercepter(axios);

        return await this.genericJenkinsPost(
            `https://${jenkinsHost}/credentials/store/system/domain/_/createCredentials`,
            {
                json: `${JSON.stringify(jenkinsCredentials)}`,
            },
            token,
            "application/x-www-form-urlencoded;charset=UTF-8",
            axios,
        );

    }

    public async updateGlobalCredential(jenkinsHost: string,
                                        token: string,
                                        jenkinsXMLCredential: string,
                                        credentialName: string) {
        logger.debug(`Trying to update jenkins global credentials. jenkinsHost: ${jenkinsHost}; token: ${token}`);

        return await this.genericJenkinsPost(
            `https://${jenkinsHost}/credentials/store/system/domain/_/credential/${credentialName}/config.xml`,
            jenkinsXMLCredential,
            token,
            "application/xml");
    }

    public async createGlobalCredentialsWithFile(jenkinsHost: string,
                                                 token: string,
                                                 gluonProjectId: string,
                                                 jenkinsCredentials: any,
                                                 filePath: string,
                                                 fileName: string) {
        logger.debug(`Trying to create jenkins global credentials from gile. jenkinsHost: ${jenkinsHost}; token: ${token}; gluonProjectId: ${gluonProjectId}; filePath: ${filePath}; fileName: ${fileName}`);
        const FormData = require("form-data");
        const fs = require("fs");

        const form = new FormData();
        form.append("json", JSON.stringify(jenkinsCredentials));
        form.append("file", fs.createReadStream(filePath), fileName);

        return await this.genericJenkinsPost(
            `https://${jenkinsHost}/credentials/store/system/domain/_/createCredentials`,
            form,
            token,
            `multipart/form-data; boundary=${form._boundary}`,
        );
    }

    public async createJenkinsJob(jenkinsHost: string, token: string, gluonProjectName: string, gluonApplicationName, jobConfig: string): Promise<any> {
        logger.debug(`Trying to create jenkins job. jenkinsHost: ${jenkinsHost}; token: ${token}; gluonProjectName: ${gluonProjectName}; gluonApplicationName: ${gluonApplicationName}`);
        return await this.genericJenkinsPost(
            `https://${jenkinsHost}/job/${_.kebabCase(gluonProjectName).toLowerCase()}/createItem?name=${_.kebabCase(gluonApplicationName).toLowerCase()}`,
            jobConfig,
            token,
            "application/xml",
        );
    }

    public async createOpenshiftEnvironmentCredentials(jenkinsHost: string, token: string, gluonProjectName: string, credentialsConfig: string): Promise<any> {
        logger.debug(`Trying to create jenkins openshift credentials. jenkinsHost: ${jenkinsHost}; token: ${token}; gluonProjectName: ${gluonProjectName}`);
        return await this.genericJenkinsPost(
            `https://${jenkinsHost}/createItem?name=${_.kebabCase(gluonProjectName).toLowerCase()}`,
            credentialsConfig,
            token,
            "application/xml",
        );
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
                    createCredentialsResult = await this.createGlobalCredentials(jenkinsHost, token, jenkinsCredentials);
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

    private async genericJenkinsPost(url: string, body: any, token: string, contentType?: string, axiosInstance?) {
        let axios = axiosInstance;
        if (axios === undefined) {
            axios = jenkinsAxios();
        }

        const headers: { [key: string]: string } = {
            Authorization: `Bearer ${token}`,
        };

        if (contentType !== undefined) {
            headers["Content-Type"] = contentType;
        }

        return axios.post(url,
            body,
            {
                headers,
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

function addXmlFormEncodedStringifyAxiosIntercepter(axios) {
    axios.interceptors.request.use(request => {
        if (request.data && (request.headers["Content-Type"].indexOf("application/x-www-form-urlencoded") !== -1)) {
            logger.debug(`Stringifying URL encoded data: ${qs.stringify(request.data)}`);
            request.data = qs.stringify(request.data);
        }
        return request;
    });
}
