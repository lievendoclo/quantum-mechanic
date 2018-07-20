import {HandleCommand, HandlerContext} from "@atomist/automation-client";
import * as _ from "lodash";
import {createMenu} from "../shared/GenericMenu";

export function getProjectId(tenant: string, project: string, environment: string): string {
    return `${_.kebabCase(tenant).toLowerCase()}-${_.kebabCase(project).toLowerCase()}-${environment.toLowerCase()}`;
}

export function getProjectDevOpsId(team: string): string {
    return `${_.kebabCase(team).toLowerCase()}-devops`;
}

export function getProjectDisplayName(tenant: string, project: string, environment: string) {
    if (tenant.toLowerCase() === "default") {
        return `${project} ${environment.toUpperCase()}`;
    }

    return `${tenant} ${project} ${environment.toUpperCase()}`;
}

export function menuForProjects(ctx: HandlerContext, projects: any[],
                                command: HandleCommand, message: string = "Please select a project",
                                projectNameVariable: string = "projectName"): Promise<any> {
    return createMenu(ctx,
        projects.map(project => {
            return {
                value: project.name,
                text: project.name,
            };
        }),
        command,
        message,
        "Select Project",
        projectNameVariable,
    );
}
