import {HandleCommand} from "@atomist/automation-client";
import {createMenuAttachment} from "./GenericMenu";

export function menuAttachmentForTenants(tenants: any[],
                                         command: HandleCommand, message: string = "Please select a tenant",
                                         tenantNameVariable: string = "tenantName") {
    return createMenuAttachment(
        tenants.map(tenant => {
            return {
                value: tenant.name,
                text: tenant.name,
            };
        }),
        command,
        message,
        message,
        "Select Tenant",
        tenantNameVariable,
    );
}

export function createQMTenant(name: string): QMTenant {
    return {
        name,
    };
}

export interface QMTenant {
    name: string;
}
