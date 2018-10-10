import {HandleCommand, HandlerContext} from "@atomist/automation-client";
import * as _ from "lodash";
import {createMenuAttachment} from "../shared/GenericMenu";

export enum ApplicationType {

    DEPLOYABLE = "DEPLOYABLE",
    LIBRARY = "LIBRARY",
}

export function menuAttachmentForApplications(ctx: HandlerContext, applications: any[],
                                              command: HandleCommand, message: string = "Please select an application/library",
                                              applicationNameVariable: string = "applicationName") {
    return createMenuAttachment(
        applications.map(application => {
            return {
                value: application.name,
                text: application.name,
            };
        }),
        command,
        message,
        message,
        "Select Application/Library",
        applicationNameVariable,
    );
}

export function getBuildConfigName(projectName: string, packageName: string): string {
    return `${_.kebabCase(projectName).toLowerCase()}-${_.kebabCase(packageName).toLowerCase()}`;
}
