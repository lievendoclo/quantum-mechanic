import {logger} from "@atomist/automation-client";
import * as _ from "lodash";
import * as util from "util";
import {QMConfig} from "../../../config/QMConfig";
import {AwaitAxios} from "../../../http/AwaitAxios";
import {isSuccessCode} from "../../../http/Http";
import {QMError} from "../../util/shared/Error";

export class TenantService {

    constructor(public axiosInstance = new AwaitAxios()) {
    }

    public async gluonTenantList(): Promise<any> {
        const tenantResult = await this.axiosInstance.get(`${QMConfig.subatomic.gluon.baseUrl}/tenants`);
        if (isSuccessCode(tenantResult.status)) {
            if (!_.isEmpty(tenantResult.data._embedded)) {
                return tenantResult.data._embedded.tenantResources;
            } else {
                throw new QMError(`No tenants found!`);
            }
        } else {
            logger.error(`Failed to get list of tenants.\nError: ${util.inspect(tenantResult)}`);
            throw new QMError("Unable to list tenants!");
        }
    }

    public async gluonTenantFromTenantName(tenantName: string): Promise<any> {
        const tenantResult = await this.axiosInstance.get(`${QMConfig.subatomic.gluon.baseUrl}/tenants?name=${tenantName}`);
        if (!isSuccessCode(tenantResult.status)) {
            logger.error(`No gluon tenant found associated with tenant name: ${tenantName}`);
            throw new QMError(`No tenant associated with tenant name: ${tenantName}`);
        }
        return tenantResult.data._embedded.tenantResources[0];
    }

    public async gluonTenantFromTenantId(tenantId: string, rawResult = false): Promise<any> {
        const tenantResult = await this.axiosInstance.get(`${QMConfig.subatomic.gluon.baseUrl}/tenants/${tenantId}`);
        if (rawResult) {
            return tenantResult;
        } else if (!isSuccessCode(tenantResult.status)) {
            logger.error(`No gluon tenant found associated with tenant id: ${tenantId}`);
            throw new QMError(`No tenant associated with tenant id: ${tenantId}`);
        }
        return tenantResult.data;
    }
}
