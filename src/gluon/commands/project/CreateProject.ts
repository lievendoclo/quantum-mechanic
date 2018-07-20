import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {
    handleQMError,
    QMError,
    ResponderMessageClient,
} from "../../util/shared/Error";
import {isSuccessCode} from "../../util/shared/Http";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/shared/RecursiveParameterRequestCommand";
import {menuForTenants} from "../../util/shared/Tenants";
import {menuForTeams} from "../../util/team/Teams";

@CommandHandler("Create a new project", QMConfig.subatomic.commandPrefix + " create project")
export class CreateProject extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "project name",
    })
    public name: string;

    @Parameter({
        description: "project description",
    })
    public description: string;

    @RecursiveParameter({
        description: "team name",
    })
    public teamName: string;

    @RecursiveParameter({
        description: "tenant name",
    })
    public tenantName: string;

    constructor(private gluonService = new GluonService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext) {
        try {
            const tenant = await this.gluonService.tenants.gluonTenantFromTenantName(this.tenantName);
            return await this.requestNewProjectForTeamAndTenant(ctx, this.screenName, this.teamName, tenant.tenantId);
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected async setNextParameter(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
            try {
                const team = await this.gluonService.teams.gluonTeamForSlackTeamChannel(this.teamChannel);
                this.teamName = team.name;
                return await this.handle(ctx);
            } catch (error) {
                const teams = await this.gluonService.teams.gluonTeamsWhoSlackScreenNameBelongsTo(this.screenName);
                return await menuForTeams(
                    ctx,
                    teams,
                    this,
                    "Please select a team you would like to associate this project with",
                );
            }
        }
        if (_.isEmpty(this.tenantName)) {
            const tenants = await this.gluonService.tenants.gluonTenantList();
            return await menuForTenants(ctx,
                tenants,
                this,
                "Please select a tenant you would like to associate this project with. Choose Default if you have no tenant specified for this project.",
            );
        }
    }

    private async requestNewProjectForTeamAndTenant(ctx: HandlerContext, screenName: string,
                                                    teamName: string, tenantId: string): Promise<any> {

        const member = await this.gluonService.members.gluonMemberFromScreenName(screenName);

        const team = await this.getGluonTeamFromName(teamName);

        await this.createGluonProject(
            {
                name: this.name,
                description: this.description,
                createdBy: member.memberId,
                owningTenant: tenantId,
                teams: [{
                    teamId: team.teamId,
                }],
            });

        return await ctx.messageClient.respond("🚀Project successfully created.");
    }

    private async getGluonTeamFromName(teamName: string) {
        const teamQueryResult = await this.gluonService.teams.gluonTeamByName(teamName);
        if (!isSuccessCode(teamQueryResult.status)) {
            logger.error(`Failed to find team ${teamName}. Error: ${JSON.stringify(teamQueryResult)}`);
            throw new QMError(`Team ${teamName} does not appear to be a valid SubAtomic team.`);
        }
        return teamQueryResult.data._embedded.teamResources[0];
    }

    private async createGluonProject(projectDetails) {
        const projectCreationResult = await this.gluonService.projects.createGluonProject(
            projectDetails);
        if (projectCreationResult.status === 409) {
            logger.error(`Failed to create project since the project name is already in use.`);
            throw new QMError(`Failed to create project since the project name is already in use. Please retry using a different project name.`);
        } else if (!isSuccessCode(projectCreationResult.status)) {
            logger.error(`Failed to create project with error: ${JSON.stringify(projectCreationResult.data)}`);
            throw new QMError(`Failed to create project.`);
        }
    }
}
