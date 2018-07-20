import {HandleCommand, HandlerContext} from "@atomist/automation-client";
import {createMenu} from "../shared/GenericMenu";

export enum ApplicationType {

    DEPLOYABLE = "DEPLOYABLE",
    LIBRARY = "LIBRARY",
}

export function menuForApplications(ctx: HandlerContext, applications: any[],
                                    command: HandleCommand, message: string = "Please select an application/library",
                                    applicationNameVariable: string = "applicationName"): Promise<any> {
    return createMenu(ctx,
        applications.map(application => {
            return {
                value: application.name,
                text: application.name,
            };
        }),
        command,
        message,
        "Select Application/Library",
        applicationNameVariable,
    );
}
