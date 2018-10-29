import {logger} from "@atomist/automation-client";
import axios from "axios";
import {AxiosInstance} from "axios-https-proxy-fix";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import {QMConfig} from "../../../config/QMConfig";
import {addAxiosLogger} from "../../../http/AxiosLogger";
import {isSuccessCode} from "../../../http/Http";
import {QMError} from "../../util/shared/Error";

export class BitbucketService {
    public async bitbucketUserFromUsername(username: string): Promise<any> {
        logger.debug(`Trying to get Bitbucket user from username. username: ${username} `);
        return await bitbucketAxios().get(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/admin/users?filter=${username}`);
    }

    public async bitbucketProjectFromKey(bitbucketProjectKey: string): Promise<any> {
        logger.debug(`Trying to get Bitbucket project from project key. bitbucketProjectKey: ${bitbucketProjectKey} `);
        return await bitbucketAxios().get(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${bitbucketProjectKey}`);
    }

    public bitbucketRepositoriesForProjectKey(bitbucketProjectKey: string): Promise<any> {
        logger.debug(`Trying to get Bitbucket repositories associated to project key. bitbucketProjectKey: ${bitbucketProjectKey} `);
        return this.getBitbucketResources(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${bitbucketProjectKey}/repos`);
    }

    public async bitbucketRepositoryForSlug(bitbucketProjectKey: string, slug: string): Promise<any> {
        logger.debug(`Trying to get Bitbucket repository associated to project key with given slug. bitbucketProjectKey: ${bitbucketProjectKey}; slug: ${slug} `);
        return await bitbucketAxios().get(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${bitbucketProjectKey}/repos/${slug}`);
    }

    public bitbucketProjects() {
        logger.debug(`Trying to get all Bitbucket projects.`);
        return this.getBitbucketResources(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects`);
    }

    public async getBitbucketResources(resourceUri: string, axiosInstance: AxiosInstance = null, currentResources = []) {
        logger.debug(`Trying to get Bitbucket resources: ${resourceUri} `);
        if (axiosInstance === null) {
            axiosInstance = bitbucketAxios();
        }
        const bitbucketResult = await axiosInstance.get(`${resourceUri}?start=${currentResources.length}`);
        if (!isSuccessCode(bitbucketResult.status)) {
            throw new QMError("Unable to find Bitbucket resources.");
        }
        const resources = bitbucketResult.data;
        currentResources = currentResources.concat(resources.values);
        if (resources.isLastPage === true) {
            return currentResources;
        }

        return await this.getBitbucketResources(resourceUri, axiosInstance, currentResources);
    }

    public async addProjectPermission(projectKey: string, user: string, permission: string = "PROJECT_READ"): Promise<any> {
        logger.debug(`Trying to add Bitbucket project permissions. projectKey: ${projectKey}; user: ${user}; permission: ${permission} `);
        return await bitbucketAxios().put(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${projectKey}/permissions/users?name=${user}&permission=${permission}`,
            {});
    }

    public async removeProjectPermission(projectKey: string, user: string): Promise<any> {
        logger.debug(`Trying to remove Bitbucket project permissions. projectKey: ${projectKey}; user: ${user}`);
        return await bitbucketAxios().delete(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${projectKey}/permissions/users?name=${user}`,
            {});
    }

    public async addBranchPermissions(projectKey: string, permissionsConfig: any): Promise<any> {
        logger.debug(`Trying to add Bitbucket branch permissions for project. projectKey: ${projectKey} `);
        return await bitbucketAxios().post(`${QMConfig.subatomic.bitbucket.restUrl}/branch-permissions/2.0/projects/${projectKey}/restrictions`,
            permissionsConfig);
    }

    public async addProjectWebHook(projectKey: string, hook: string, data = {}): Promise<any> {
        logger.debug(`Trying to add project web hook. projectKey: ${projectKey}; hook: ${hook} `);
        return await bitbucketAxios().put(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${projectKey}/settings/hooks/${hook}/enabled`,
            data);
    }

    public async getDefaultReviewers(projectKey: string): Promise<any> {
        logger.debug(`Trying to get Bitbucket default reviewers for project. projectKey: ${projectKey} `);
        return await bitbucketAxios().get(`${QMConfig.subatomic.bitbucket.restUrl}/default-reviewers/1.0/projects/${projectKey}/conditions`);
    }

    public async addDefaultReviewers(projectKey: string, defaultReviewerConfig: any): Promise<any> {
        logger.debug(`Trying to add Bitbucket default reviewers for project. projectKey: ${projectKey} `);
        return await bitbucketAxios().post(`${QMConfig.subatomic.bitbucket.restUrl}/default-reviewers/1.0/projects/${projectKey}/condition`,
            defaultReviewerConfig);
    }

    public async addBitbucketProjectAccessKeys(projectKey: string) {
        logger.debug(`Trying to add Bitbucket project access keys. projectKey: ${projectKey} `);
        const accessKeysResult = await bitbucketAxios().post(`${QMConfig.subatomic.bitbucket.restUrl}/keys/1.0/projects/${projectKey}/ssh`,
            {
                key: {
                    text: QMConfig.subatomic.bitbucket.cicdKey,
                },
                permission: "PROJECT_READ",
            });
        if (!accessKeysResult || !isSuccessCode(accessKeysResult.status)) {
            logger.warn(`Could not add SSH keys to Bitbucket project.`);
            if (accessKeysResult) {
                logger.warn(`Error: ${accessKeysResult.status}-${JSON.stringify(accessKeysResult.data)}]`);
            }
            if (accessKeysResult && accessKeysResult.status === 409) {
                logger.warn(`Probably failed due to keys already existing.`);
            } else {
                throw new QMError("Failed to add ssh keys to Bitbucket project.");
            }
        }
    }

    public async createBitbucketProject(projectData: any): Promise<any> {
        logger.debug(`Trying to create Bitbucket project.`);
        return await bitbucketAxios().post(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects`,
            projectData);
    }
}

export function bitbucketAxios(): AxiosInstance {
    const caFile = path.resolve(__dirname, QMConfig.subatomic.bitbucket.caPath);
    const instance = axios.create({
        httpsAgent: new https.Agent({
            rejectUnauthorized: true,
            ca: fs.readFileSync(caFile),
        }),
        auth: QMConfig.subatomic.bitbucket.auth,
        timeout: 30000,
        proxy: false,
    });
    return addAxiosLogger(instance, "Bitbucket");
}
