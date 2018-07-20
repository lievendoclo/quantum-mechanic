import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    success,
    Tags,
} from "@atomist/automation-client";
import _ = require("lodash");
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {menuForProjects} from "../../util/project/Project";
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
import {menuForTeams} from "../../util/team/Teams";

@CommandHandler("Create new OpenShift environments for a project", QMConfig.subatomic.commandPrefix + " request project environments")
@Tags("subatomic", "openshift", "project")
export class NewProjectEnvironments extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        description: "project name",
    })
    public projectName: string = null;

    @Parameter({
        description: "team name",
        displayable: false,
        required: false,
    })
    public teamName: string = null;

    constructor(private gluonService = new GluonService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext) {
        logger.info("Creating new OpenShift environments...");

        try {
            await ctx.messageClient.addressChannels({
                text: `Requesting project environment's for project *${this.projectName}*`,
            }, this.teamChannel);

            const member = await this.gluonService.members.gluonMemberFromScreenName(this.screenName);

            const project = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);

            await this.requestProjectEnvironment(project.projectId, member.memberId);

            return await success();
        } catch (error) {
            return await this.handleError(ctx, error);
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
                    "Please select a team associated with the project you wish to provision the environments for",
                );
            }
        }
        if (_.isEmpty(this.projectName)) {
            const projects = await this.gluonService.projects.gluonProjectsWhichBelongToGluonTeam(this.teamName);
            return await menuForProjects(
                ctx,
                projects,
                this,
                "Please select the projects you wish to provision the environments for",
            );
        }
    }

    private async requestProjectEnvironment(projectId: string, memberId: string) {
        const projectEnvironmentRequestResult = await this.gluonService.projects.requestProjectEnvironment(projectId,
            memberId,
        );

        if (!isSuccessCode(projectEnvironmentRequestResult.status)) {
            logger.error(`Failed to request project environment for project ${this.projectName}. Error: ${JSON.stringify(projectEnvironmentRequestResult)}`);
            throw new QMError("Failed to request project environment. Network error.");
        }
    }

    private async handleError(ctx: HandlerContext, error) {
        return await handleQMError(new ResponderMessageClient(ctx), error);
    }
}
