import * as _ from "lodash";

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
