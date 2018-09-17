import {HandleCommand, HandlerContext} from "@atomist/automation-client";
import * as _ from "lodash";
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

export function getBuildConfigName(projectName: string, packageName: string): string {
    return `${_.kebabCase(projectName).toLowerCase()}-${_.kebabCase(packageName).toLowerCase()}`;
}
