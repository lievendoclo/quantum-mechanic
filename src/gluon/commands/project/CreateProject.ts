import {
    CommandHandler,
    HandlerContext,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {
    GluonTeamNameSetter,
    GluonTenantNameSetter,
    setGluonTeamName,
    setGluonTenantName,
} from "../../util/recursiveparam/GluonParameterSetters";
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

@CommandHandler("Create a new project", QMConfig.subatomic.commandPrefix + " create project")
export class CreateProject extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter, GluonTenantNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        tenantName: "TENANT_NAME",
    };

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
        recursiveKey: CreateProject.RecursiveKeys.teamName,
        selectionMessage: "Please select a team you would like to associate this project with",
    })
    public teamName: string;

    @RecursiveParameter({
        recursiveKey: CreateProject.RecursiveKeys.tenantName,
        selectionMessage: "Please select a tenant you would like to associate this project with. Choose Default if you have no tenant specified for this project.",
    })
    public tenantName: string;

    constructor(public gluonService = new GluonService()) {
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

    protected configureParameterSetters() {
        this.addRecursiveSetter(CreateProject.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(CreateProject.RecursiveKeys.tenantName, setGluonTenantName);
    }

    private async requestNewProjectForTeamAndTenant(ctx: HandlerContext, screenName: string,
                                                    teamName: string, tenantId: string): Promise<any> {

        const member = await this.gluonService.members.gluonMemberFromScreenName(screenName);

        const team = await this.gluonService.teams.gluonTeamByName(teamName);

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
