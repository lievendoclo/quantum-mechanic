import {HandleCommand, HandlerContext} from "@atomist/automation-client";
import {createMenu} from "./GenericMenu";

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
