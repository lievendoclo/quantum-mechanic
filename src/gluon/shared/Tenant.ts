import {HandleCommand, HandlerContext} from "@atomist/automation-client";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {createMenu} from "./GenericMenu";

export function gluonTenantList(): Promise<any> {
    return axios.get(`${QMConfig.subatomic.gluon.baseUrl}/tenants`)
        .then(tenant => {
            if (!_.isEmpty(tenant.data._embedded)) {
                return Promise.resolve(tenant.data._embedded.tenantResources);
            } else {
                return Promise.reject(`No tenants found!`);
            }
        });
}

export function gluonTenantFromTenantName(tenantName: string): Promise<any> {
    return axios.get(`${QMConfig.subatomic.gluon.baseUrl}/tenants?name=${tenantName}`)
        .then(tenant => {
            if (!_.isEmpty(tenant.data._embedded)) {
                return Promise.resolve(tenant.data._embedded.tenantResources[0]);
            } else {
                return Promise.reject(`No tenant associated with tenant name: ${tenantName}`);
            }
        });
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
