import {
    HandlerContext,
    HandlerResult,
    logger,
} from "@atomist/automation-client";
import {GluonService} from "../../services/gluon/GluonService";
import {menuForApplications} from "../packages/Applications";
import {menuForProjects} from "../project/Project";
import {QMError} from "../shared/Error";
import {menuForTenants} from "../shared/Tenants";
import {menuForTeams} from "../team/Teams";

export async function setGluonTeamName(
    ctx: HandlerContext,
    commandHandler: GluonTeamNameSetter,
    selectionMessage: string = "Please select a team") {
    if (commandHandler.gluonService === undefined) {
        throw new QMError(`setGluonTeamName commandHandler requires gluonService parameter to be defined`);
    }

    if (commandHandler.screenName === undefined) {
        throw new QMError(`setGluonTeamName commandHandler requires screenName mapped parameter to be defined`);
    }

    if (commandHandler.teamChannel !== undefined) {
        try {
            const team = await commandHandler.gluonService.teams.gluonTeamForSlackTeamChannel(commandHandler.teamChannel);
            commandHandler.teamName = team.name;
            return await commandHandler.handle(ctx);
        } catch (slackChannelError) {
            logger.info(`Could not find team associated with channel: ${commandHandler.teamChannel}. Trying to find teams member is a part of.`);
        }
    } else {
        logger.info(`CommandHandler teamChannel is undefined. Trying to find teams member is a part of.`);
    }

    const teams = await commandHandler.gluonService.teams.gluonTeamsWhoSlackScreenNameBelongsTo(commandHandler.screenName);
    return await menuForTeams(
        ctx,
        teams,
        commandHandler,
        selectionMessage);
}

export interface GluonTeamNameSetter {
    gluonService: GluonService;
    teamChannel?: string;
    screenName: string;
    teamName: string;
    handle: (ctx: HandlerContext) => Promise<HandlerResult>;
}

export async function setGluonProjectName(
    ctx: HandlerContext,
    commandHandler: GluonProjectNameSetter,
    selectionMessage: string = "Please select a project") {

    if (commandHandler.gluonService === undefined) {
        throw new QMError(`setGluonProjectName commandHandler requires gluonService parameter to be defined`);
    }

    if (commandHandler.teamName === undefined) {
        throw new QMError(`setGluonProjectName commandHandler requires the teamName parameter to be defined`);
    }

    const projects = await commandHandler.gluonService.projects.gluonProjectsWhichBelongToGluonTeam(commandHandler.teamName);
    return await menuForProjects(
        ctx,
        projects,
        commandHandler,
        selectionMessage,
    );
}

export interface GluonProjectNameSetter {
    gluonService: GluonService;
    teamName: string;
    projectName: string;
    handle: (ctx: HandlerContext) => Promise<HandlerResult>;
}

export async function setGluonTenantName(
    ctx: HandlerContext,
    commandHandler: GluonTenantNameSetter,
    selectionMessage: string = "Please select a tenant") {

    if (commandHandler.gluonService === undefined) {
        throw new QMError(`setGluonTenantName commandHandler requires gluonService parameter to be defined`);
    }

    const tenants = await commandHandler.gluonService.tenants.gluonTenantList();
    return await menuForTenants(ctx,
        tenants,
        commandHandler,
        selectionMessage,
    );
}

export interface GluonTenantNameSetter {
    gluonService: GluonService;
    tenantName: string;
    handle: (ctx: HandlerContext) => Promise<HandlerResult>;
}

export async function setGluonApplicationName(
    ctx: HandlerContext,
    commandHandler: GluonApplicationNameSetter,
    selectionMessage: string = "Please select an application") {
    if (commandHandler.gluonService === undefined) {
        throw new QMError(`setGluonApplicationName commandHandler requires gluonService parameter to be defined`);
    }

    if (commandHandler.projectName === undefined) {
        throw new QMError(`setGluonApplicationName commandHandler requires the projectName parameter to be defined`);
    }

    const applications = await commandHandler.gluonService.applications.gluonApplicationsLinkedToGluonProject(commandHandler.projectName);
    return await menuForApplications(
        ctx,
        applications,
        commandHandler,
        selectionMessage);
}

export interface GluonApplicationNameSetter {
    gluonService: GluonService;
    projectName: string;
    applicationName: string;
    handle: (ctx: HandlerContext) => Promise<HandlerResult>;
}
