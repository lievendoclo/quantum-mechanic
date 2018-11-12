import {HandleCommand, HandlerContext} from "@atomist/automation-client";
import * as _ from "lodash";
import {QMBitbucketProject} from "../bitbucket/Bitbucket";
import {createMenuAttachment} from "../shared/GenericMenu";
import {QMTenant} from "../shared/Tenants";
import {QMTeam} from "../team/Teams";

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

export function menuAttachmentForProjects(ctx: HandlerContext, projects: any[],
                                          command: HandleCommand, message: string = "Please select a project",
                                          projectNameVariable: string = "projectName") {
    return createMenuAttachment(
        projects.map(project => {
            return {
                value: project.name,
                text: project.name,
            };
        }),
        command,
        message,
        message,
        "Select Project",
        projectNameVariable,
    );
}

export interface OpenshiftProjectEnvironmentRequest {
    teams: QMTeam[];
    project: QMProjectBase;
    owningTenant: QMTenant;
}

export interface QMProjectBase {
    projectId: string;
    name: string;
    bitbucketProject: QMBitbucketProject;
}

export interface QMProject extends QMProjectBase {
    owningTeam: QMTeam;
}

export enum ProjectProdRequestApprovalResponse {
    approve = "approve",
    reject = "reject",
    ignore = "ignore",
}
