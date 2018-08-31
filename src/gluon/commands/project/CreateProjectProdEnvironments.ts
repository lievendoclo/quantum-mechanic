import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Tags,
} from "@atomist/automation-client";
import {addressEvent} from "@atomist/automation-client/spi/message/MessageClient";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {
    GluonProjectNameSetter,
    GluonTeamNameSetter,
    setGluonProjectName,
    setGluonTeamName,
} from "../../util/recursiveparam/GluonParameterSetters";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/recursiveparam/RecursiveParameterRequestCommand";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";
import {GluonToEvent} from "../../util/transform/GluonToEvent";

@CommandHandler("Create the OpenShift production environments for a project", QMConfig.subatomic.commandPrefix + " request project prod")
@Tags("subatomic", "openshiftProd", "project")
export class CreateProjectProdEnvironments extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter, GluonProjectNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        projectName: "PROJECT_NAME",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        recursiveKey: CreateProjectProdEnvironments.RecursiveKeys.projectName,
        selectionMessage: "Please select the projects you wish to provision the production environments for",
    })
    public projectName: string = null;

    @RecursiveParameter({
        recursiveKey: CreateProjectProdEnvironments.RecursiveKeys.teamName,
        selectionMessage: "Please select a team associated with the project you wish to provision the production environments for",
        forceSet: false,
    })
    public teamName: string = null;

    constructor(public gluonService = new GluonService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info("Creating project OpenShift production environments...");

        try {
            await ctx.messageClient.addressChannels({
                text: `Requesting production environments's for project *${this.projectName}*`,
            }, this.teamChannel);

            const project = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);

            const teams = await this.gluonService.teams.getTeamsAssociatedToProject(project.projectId);

            const owningTenant = await this.gluonService.tenants.gluonTenantFromTenantId(project.owningTenant);

            const member = await this.gluonService.members.gluonMemberFromScreenName(this.screenName);

            return ctx.messageClient.send(this.buildCreateProjectProdEnvironmentsEvent(project, teams, owningTenant, member)
                , addressEvent("ProjectProductionEnvironmentsRequestedEvent"));
        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(CreateProjectProdEnvironments.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(CreateProjectProdEnvironments.RecursiveKeys.projectName, setGluonProjectName);
    }

    private buildCreateProjectProdEnvironmentsEvent(project, teams, owningTenant, requestedBy) {

        for (const team of teams) {
            team.owners = this.getGluonMemberDetails(team.owners);
            team.members = this.getGluonMemberDetails(team.members);
        }

        return {
            project: GluonToEvent.project(project),
            teams: teams.map(team => GluonToEvent.team(team)),
            owningTenant,
            requestedBy: GluonToEvent.member(requestedBy),
        };
    }

    private async getGluonMemberDetails(gluonMembers: Array<{ memberId: string }>): Promise<any[]> {
        const memberDetails = [];
        for (const member of gluonMembers) {
            memberDetails.push(GluonToEvent.member(this.gluonService.members.gluonMemberFromMemberId(member.memberId)));
        }
        return memberDetails;
    }

    private async handleError(ctx: HandlerContext, error) {
        return await handleQMError(new ResponderMessageClient(ctx), error);
    }
}
