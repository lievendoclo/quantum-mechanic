import {
    HandleCommand,
    HandlerContext,
    logger,
} from "@atomist/automation-client";
import axios from "axios";
import {AxiosInstance} from "axios-https-proxy-fix";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import {QMConfig} from "../../config/QMConfig";
import {addAxiosLogger} from "../shared/axiosLogger";
import {QMError} from "../shared/Error";
import {createMenu} from "../shared/GenericMenu";
import {isSuccessCode} from "../shared/Http";

export class BitbucketService {
    public async bitbucketUserFromUsername(username: string): Promise<any> {
        return await bitbucketAxios().get(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/admin/users?filter=${username}`);
    }

    public async bitbucketProjectFromKey(bitbucketProjectKey: string): Promise<any> {
        return await bitbucketAxios().get(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${bitbucketProjectKey}`);
    }

    public bitbucketRepositoriesForProjectKey(bitbucketProjectKey: string): Promise<any> {
        return this.getBitbucketResources(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${bitbucketProjectKey}/repos`);
    }

    public async bitbucketRepositoryForSlug(bitbucketProjectKey: string, slug: string): Promise<any> {
        return await bitbucketAxios().get(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${bitbucketProjectKey}/repos/${slug}`);
    }

    public bitbucketProjects() {
        return this.getBitbucketResources(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects`);
    }

    public async getBitbucketResources(resourceUri: string, axiosInstance: AxiosInstance = null, currentResources = []) {
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
        return await bitbucketAxios().put(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${projectKey}/permissions/users?name=${user}&permission=${permission}`,
            {});
    }

    public async addBranchPermissions(projectKey: string, permissionsConfig: any): Promise<any> {
        return await bitbucketAxios().post(`${QMConfig.subatomic.bitbucket.restUrl}/branch-permissions/2.0/projects/${projectKey}/restrictions`,
            permissionsConfig);
    }

    public async addProjectWebHook(projectKey: string, hook: string, data = {}): Promise<any> {
        return await bitbucketAxios().put(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${projectKey}/settings/hooks/${hook}/enabled`,
            data);
    }

    public async getDefaultReviewers(projectKey: string): Promise<any> {
        return await bitbucketAxios().get(`${QMConfig.subatomic.bitbucket.restUrl}/default-reviewers/1.0/projects/${projectKey}/conditions`);
    }

    public async addDefaultReviewers(projectKey: string, defaultReviewerConfig: any): Promise<any> {
        return await bitbucketAxios().post(`${QMConfig.subatomic.bitbucket.restUrl}/default-reviewers/1.0/projects/${projectKey}/condition`,
            defaultReviewerConfig);
    }

    public async addBitbucketProjectAccessKeys(projectKey: string) {
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

export function menuForBitbucketRepositories(ctx: HandlerContext, bitbucketRepositories: any[],
                                             command: HandleCommand, message: string = "Please select a Bitbucket repository",
                                             bitbucketProjectNameVariable: string = "bitbucketRepositoryName",
                                             thumbUrl = ""): Promise<any> {
    return createMenu(ctx,
        bitbucketRepositories.map(bitbucketRepository => {
            return {
                value: bitbucketRepository.name,
                text: bitbucketRepository.name,
            };
        }),
        command,
        message,
        "Select Bitbucket Repo",
        bitbucketProjectNameVariable,
        thumbUrl,
    );
}
