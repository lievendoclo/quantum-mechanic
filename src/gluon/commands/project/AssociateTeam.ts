import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {menuForProjects} from "../../util/project/Project";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/recursiveparam/RecursiveParameterRequestCommand";
import {
    handleQMError,
    QMError,
    ResponderMessageClient,
} from "../../util/shared/Error";
import {isSuccessCode} from "../../util/shared/Http";
import {menuForTeams} from "../../util/team/Teams";

@CommandHandler("Add additional team/s to a project", QMConfig.subatomic.commandPrefix + " associate team")
export class AssociateTeam extends RecursiveParameterRequestCommand {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        projectName: "PROJECT_NAME",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        recursiveKey: AssociateTeam.RecursiveKeys.teamName,
        selectionMessage: `Please select a team you would like to associate to the project`,
    })
    public teamName: string;

    @RecursiveParameter({
        recursiveKey: AssociateTeam.RecursiveKeys.projectName,
        selectionMessage: `Please select a project you would like to associate this team to.`,
    })
    public projectName: string;

    public constructor(public gluonService = new GluonService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext) {
        try {
            return await this.linkProjectForTeam(ctx, this.teamName);
        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(AssociateTeam.RecursiveKeys.projectName, setGluonProjectNameFromList);
        this.addRecursiveSetter(AssociateTeam.RecursiveKeys.teamName, setGluonTeamFromUnassociatedTeams);
    }

    private async linkProjectForTeam(ctx: HandlerContext, teamName: string): Promise<HandlerResult> {
        const team = await this.gluonService.teams.gluonTeamByName(teamName);
        const gluonProject = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);
        let updateGluonWithProjectDetails;
        try {
            updateGluonWithProjectDetails = await this.updateGluonProject(gluonProject.projectId, gluonProject.createdBy, team.data._embedded.teamResources[0].teamId, team.data._embedded.teamResources[0].name);
        } catch (error) {
            throw new QMError(`Team *${team.data._embedded.teamResources[0].name}* was already associated with project ${gluonProject.projectId}`);
        }

        if (isSuccessCode(updateGluonWithProjectDetails.status)) {
            return await ctx.messageClient.respond(`Team *${team.data._embedded.teamResources[0].name}* has been successfully associated with ${gluonProject.projectId}`);
        } else {
            logger.error(`Failed to link project. Error ${updateGluonWithProjectDetails.data}`);
            throw new QMError(`Failed to link project.`);
        }

    }

    private async updateGluonProject(projectId: string, createdBy: string, teamId: string, name: string) {

        return await this.gluonService.projects.associateTeamToProject(projectId,
            {
                productId: `${projectId}`,
                createdBy: `${createdBy}`,
                teams: [{
                    teamId: `${teamId}`,
                    name: `${name}`,
                }],
            });
    }

    private async handleError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }

}

async function setGluonTeamFromUnassociatedTeams(ctx: HandlerContext, commandHandler: AssociateTeam) {
    const teams = await commandHandler.gluonService.teams.gluonTeamsWhoSlackScreenNameBelongsTo(commandHandler.screenName);
    const availTeams = await availableTeamsToAssociate(commandHandler.gluonService, teams, commandHandler.projectName);

    if (_.isEmpty(availTeams)) {
        return await ctx.messageClient.respond("Unfortunately there are no available teams to associate to.");
    }

    return await menuForTeams(
        ctx,
        availTeams,
        commandHandler,
        `Please select a team you would like to associate to *${commandHandler.projectName}*.`,
    );
}

async function availableTeamsToAssociate(gluonService: GluonService, teams: any[], projectName: string): Promise<any[]> {
    const allTeams = [];
    const associatedTeams = [];
    const unlinked = [];

    for (const team of teams) {
        allTeams.push(team.name);
    }

    const projectTeams = await gluonService.projects.gluonProjectFromProjectName(projectName);

    for (const team of projectTeams.teams) {
        associatedTeams.push(team.name);
    }
    for (const i of allTeams) {
        if (!associatedTeams.includes(i)) {
            unlinked.push(i);
        }
    }

    return unlinked.map(team => {
        return {
            name: team,
        };
    });
}

export async function setGluonProjectNameFromList(
    ctx: HandlerContext,
    commandHandler: AssociateTeam,
    selectionMessage: string = "Please select a project") {

    if (commandHandler.gluonService === undefined) {
        throw new QMError(`setGluonProjectName commandHandler requires gluonService parameter to be defined`);
    }

    const projects = await commandHandler.gluonService.projects.gluonProjectList();
    return await menuForProjects(
        ctx,
        projects,
        commandHandler,
        selectionMessage,
    );
}
