import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {ApplicationType} from "../../util/packages/Applications";
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

@CommandHandler("Create a new Bitbucket project", QMConfig.subatomic.commandPrefix + " create bitbucket project")
export class CreateApplication extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "application name",
    })
    public name: string;

    @Parameter({
        description: "application description",
    })
    public description: string;

    @Parameter({
        description: "Bitbucket repository name",
    })
    public bitbucketRepositoryName: string;

    @Parameter({
        description: "Bitbucket repository URL",
    })
    public bitbucketRepositoryRepoUrl: string;

    @RecursiveParameter({
        description: "project name",
    })
    public projectName: string;

    @RecursiveParameter({
        description: "team name",
    })
    public teamName: string;

    constructor(private gluonService = new GluonService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        // get memberId for createdBy
        try {
            await ctx.messageClient.respond({
                text: "🚀 Your new application is being created...",
            });

            const member = await this.gluonService.members.gluonMemberFromScreenName(this.screenName);

            const project = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);

            await this.createApplicationInGluon(project, member);

            return await ctx.messageClient.respond({
                text: "🚀 Application created successfully.",
            });
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }

    }

    protected async setNextParameter(ctx: HandlerContext) {
        if (_.isEmpty(this.teamName)) {
            try {
                const team = await this.gluonService.teams.gluonTeamForSlackTeamChannel(this.teamChannel);
                this.teamName = team.name;
                return await this.handle(ctx);
            } catch (error) {
                const teams = await this.gluonService.teams.gluonTeamsWhoSlackScreenNameBelongsTo(this.screenName);
                return await menuForTeams(ctx, teams, this);
            }
        }
        if (_.isEmpty(this.projectName)) {
            const projects = await this.gluonService.projects.gluonProjectsWhichBelongToGluonTeam(this.teamName);
            return await menuForProjects(ctx, projects, this);
        }
    }

    private async createApplicationInGluon(project, member) {
        const createApplicationResult = await this.gluonService.applications.createGluonApplication(
            {
                name: this.name,
                description: this.description,
                applicationType: ApplicationType.DEPLOYABLE,
                projectId: project.projectId,
                createdBy: member.memberId,
                bitbucketRepository: {
                    name: this.bitbucketRepositoryName,
                    repoUrl: this.bitbucketRepositoryRepoUrl,
                },
                requestConfiguration: true,
            });

        if (!isSuccessCode(createApplicationResult.status)) {
            throw new QMError("Your new application could not be created. Please ensure it does not already exist.");
        }
    }
}
