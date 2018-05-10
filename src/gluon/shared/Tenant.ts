import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";

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
