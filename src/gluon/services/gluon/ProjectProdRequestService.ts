import {logger} from "@atomist/automation-client";
import _ = require("lodash");
import {inspect} from "util";
import {QMConfig} from "../../../config/QMConfig";
import {AwaitAxios} from "../../../http/AwaitAxios";
import {isSuccessCode} from "../../../http/Http";
import {QMMemberBase} from "../../util/member/Members";
import {QMProjectBase} from "../../util/project/Project";
import {QMError} from "../../util/shared/Error";

export class ProjectProdRequestService {

    constructor(public axiosInstance = new AwaitAxios()) {
    }

    public async createProjectProdRequest(actionedByMemberId: string, projectId: string, rawResult: boolean = false): Promise<any> {
        logger.debug(`Trying to create project prod request. actionedBy: ${actionedByMemberId}, projectId: ${projectId}`);
        const request = {
            actionedBy: {
                memberId: actionedByMemberId,
            },
            project: {
                projectId,
            },
        };
        const prodRequestResult = await this.axiosInstance.post(`${QMConfig.subatomic.gluon.baseUrl}/projectProdRequests`, request);
        if (rawResult) {
            return prodRequestResult;
        }

        if (!isSuccessCode(prodRequestResult.status)) {
            logger.error(`Request to create project prod request failed: ${inspect(prodRequestResult)}`);
            throw new QMError("Unable to create the prod request. Please make sure that you are member of a team associated to the project");
        }

        return prodRequestResult.data;
    }

    public async getProjectProdRequestById(projectProdRequestId: string, rawResult: boolean = false): Promise<any> {
        logger.debug(`Trying to get project prod request. projectProdRequestId: ${projectProdRequestId}`);
        const prodRequestResult = await this.axiosInstance.get(`${QMConfig.subatomic.gluon.baseUrl}/projectProdRequests/${projectProdRequestId}`);
        if (rawResult) {
            return prodRequestResult;
        }

        if (!isSuccessCode(prodRequestResult.status)) {
            logger.error(`Request to find project prod request failed: ${inspect(prodRequestResult)}`);
            throw new QMError("Unable to find the prod request details for raised request. Please make sure the request exists or contact your Subatomic administrator.");
        }

        return prodRequestResult.data;
    }

    public async approveProjectProdRequest(projectProdRequestId: string, actionedByMemberId: string, rawResult: boolean = false): Promise<any> {
        logger.debug(`Trying to approve project prod request. projectProdRequestId: ${projectProdRequestId}, actionedBy: ${actionedByMemberId}`);
        const prodRequestUpdateResult = await this.updateProjectProdRequest(projectProdRequestId, actionedByMemberId, "APPROVED");
        if (rawResult) {
            return prodRequestUpdateResult;
        }

        if (!isSuccessCode(prodRequestUpdateResult.status)) {
            logger.error(`Request to approve project prod request failed: ${inspect(prodRequestUpdateResult)}`);
            throw new QMError("Unable to update the project prod request. Please make sure the request exists or contact your Subatomic administrator.");
        }

        return prodRequestUpdateResult.data;
    }

    public async rejectProjectProdRequest(projectProdRequestId: string, actionedByMemberId: string, rawResult: boolean = false): Promise<any> {
        logger.debug(`Trying to reject project prod request. projectProdRequestId: ${projectProdRequestId}, actionedBy: ${actionedByMemberId}`);
        const prodRequestUpdateResult = await this.updateProjectProdRequest(projectProdRequestId, actionedByMemberId, "REJECTED");
        if (rawResult) {
            return prodRequestUpdateResult;
        }

        if (!isSuccessCode(prodRequestUpdateResult.status)) {
            logger.error(`Request to reject project prod request failed: ${inspect(prodRequestUpdateResult)}`);
            throw new QMError("Unable to reject the project prod request. Please make sure the request exists or contact your Subatomic administrator.");
        }

        return prodRequestUpdateResult.data;
    }

    public async getProjectProdRequestsByProjectId(projectId: string, rawResult: boolean = false): Promise<QMProjectProdRequest[] | any> {
        logger.debug(`Trying to get project prod request by projectId. projectId: ${projectId}`);
        const prodRequestResult = await this.axiosInstance.get(`${QMConfig.subatomic.gluon.baseUrl}/projectProdRequests?projectId=${projectId}`);
        if (rawResult) {
            return prodRequestResult;
        }

        if (!isSuccessCode(prodRequestResult.status)) {
            logger.error(`Request to find project prod requests failed: ${inspect(prodRequestResult)}`);
            throw new QMError("Unable to find any prod requests associated to the selected project. Please make that the project has requested prod promotion.");
        }
        let result: QMProjectProdRequest[] = [];
        if (!_.isEmpty(prodRequestResult.data._embedded)) {
            result = prodRequestResult.data._embedded.projectProdRequestResources;
        }
        return result;
    }

    private async updateProjectProdRequest(projectProdRequestId: string, actionedBy: string, approvalStatus: string): Promise<any> {
        return await this.axiosInstance.put(`${QMConfig.subatomic.gluon.baseUrl}/projectProdRequests/${projectProdRequestId}`,
            {
                approvalStatus: approvalStatus.toUpperCase(),
                actionedBy: {
                    memberId: actionedBy,
                },
            });
    }

}

export interface QMProjectProdRequestBase {
    projectProdRequestId: string;
    approvalStatus: string;
}

export interface QMProjectProdRequest extends QMProjectProdRequestBase {
    project: QMProjectBase;
    actionedBy: QMMemberBase;
    authorizingMembers: QMMemberBase[];
    rejectingMember?: QMMemberBase;
}
