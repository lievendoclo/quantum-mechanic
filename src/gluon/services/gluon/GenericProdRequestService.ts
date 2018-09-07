import {logger} from "@atomist/automation-client";
import {inspect} from "util";
import {QMConfig} from "../../../config/QMConfig";
import {AwaitAxios} from "../../../http/AwaitAxios";
import {isSuccessCode} from "../../../http/Http";
import {QMError} from "../../util/shared/Error";

export class GenericProdRequestService {

    constructor(public axiosInstance = new AwaitAxios()) {
    }

    public async createGenericProdRequest(genericProdRequestDetails: any, rawResult: boolean = false): Promise<any> {
        logger.debug(`Trying to create generic prod request.`);
        const prodRequestResult = await this.axiosInstance.post(`${QMConfig.subatomic.gluon.baseUrl}/genericProdRequests`, genericProdRequestDetails);
        if (rawResult) {
            return prodRequestResult;
        }

        if (!isSuccessCode(prodRequestResult.status)) {
            logger.error(`Request to create generic prod request failed: ${inspect(prodRequestResult)}`);
            throw new QMError("Unable to create the prod request. Please make sure that you are member of a team associated to the application");
        }

        return prodRequestResult.data;
    }

    public async getGenericProdRequestById(genericProdRequestId: string, rawResult: boolean = false): Promise<any> {
        logger.debug(`Trying to create generic prod request. genericProdRequestId: ${genericProdRequestId}`);
        const prodRequestResult = await this.axiosInstance.get(`${QMConfig.subatomic.gluon.baseUrl}/genericProdRequests/${genericProdRequestId}`);
        if (rawResult) {
            return prodRequestResult;
        }

        if (!isSuccessCode(prodRequestResult.status)) {
            logger.error(`Request to find generic prod request failed: ${inspect(prodRequestResult)}`);
            throw new QMError("Unable to find the prod request details for raised request. Please make sure the request exists or contact your Subatomic administrator.");
        }

        return prodRequestResult.data;
    }
}
