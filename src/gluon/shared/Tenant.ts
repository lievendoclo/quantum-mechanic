import {
    HandleCommand,
    HandlerContext,
    logger,
} from "@atomist/automation-client";
import axios from "axios";
import * as _ from "lodash";
import * as util from "util";
import {QMConfig} from "../../config/QMConfig";
import {QMError} from "./Error";
import {createMenu} from "./GenericMenu";
import {isSuccessCode} from "./Http";

export async function gluonTenantList(): Promise<any> {
    const tenantResult = await axios.get(`${QMConfig.subatomic.gluon.baseUrl}/tenants`);
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

export async function gluonTenantFromTenantName(tenantName: string): Promise<any> {
    const tenantResult = await axios.get(`${QMConfig.subatomic.gluon.baseUrl}/tenants?name=${tenantName}`);
    if (!isSuccessCode(tenantResult.status)) {
        logger.error(`No gluon tenant found associated with tenant name: ${tenantName}`);
        throw new QMError(`No tenant associated with tenant name: ${tenantName}`);
    }
    return tenantResult.data._embedded.tenantResources[0];
}

export function gluonTenantFromTenantId(tenantId: string): Promise<any> {
    return axios.get(`${QMConfig.subatomic.gluon.baseUrl}/tenants/${tenantId}`)
        .then(tenant => {
            return Promise.resolve(tenant.data);
        });
}

export function menuForTenants(ctx: HandlerContext, tenants: any[],
                               command: HandleCommand, message: string = "Please select a tenant",
                               tenantNameVariable: string = "tenantName"): Promise<any> {
    return createMenu(ctx,
        tenants.map(tenant => {
            return {
                value: tenant.name,
                text: tenant.name,
            };
        }),
        command,
        message,
        "Select Tenant",
        tenantNameVariable,
    );
}
