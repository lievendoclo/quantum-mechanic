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
import {BitbucketService} from "../../services/bitbucket/BitbucketService";
import {GluonService} from "../../services/gluon/GluonService";
import {PackageCommandService} from "../../services/packages/PackageCommandService";
import {menuForBitbucketRepositories} from "../../util/bitbucket/Bitbucket";
import {ApplicationType} from "../../util/packages/Applications";
import {menuForProjects} from "../../util/project/Project";
import {
    handleQMError,
    QMError,
    ResponderMessageClient,
} from "../../util/shared/Error";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/shared/RecursiveParameterRequestCommand";
import {menuForTeams} from "../../util/team/Teams";

@CommandHandler("Link an existing library", QMConfig.subatomic.commandPrefix + " link library")
export class LinkExistingLibrary extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "library name",
    })
    public name: string;

    @Parameter({
        description: "library description",
    })
    public description: string;

    @Parameter({
        description: "team name",
        displayable: false,
        required: false,
    })
    public teamName: string;

    @RecursiveParameter({
        description: "project name",
    })
    public projectName: string;

    @RecursiveParameter({
        description: "Bitbucket repository slug",
    })
    public bitbucketRepositorySlug: string;

    constructor(private gluonService = new GluonService(),
                private bitbucketService = new BitbucketService(),
                private packageCommandService = new PackageCommandService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            await ctx.messageClient.addressChannels({
                text: "🚀 Your new library is being created...",
            }, this.teamChannel);

            return await this.packageCommandService.linkBitbucketRepoToGluonPackage(
                this.screenName,
                this.name,
                this.description,
                this.bitbucketRepositorySlug,
                this.projectName,
                ApplicationType.LIBRARY,
            );
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
                return menuForTeams(
                    ctx,
                    teams,
                    this,
                    "Please select a team, whose project you would like to link a library to");

            }
        }
        if (_.isEmpty(this.projectName)) {
            const projects = await this.gluonService.projects.gluonProjectsWhichBelongToGluonTeam(this.teamName);
            return menuForProjects(
                ctx,
                projects,
                this,
                "Please select a project to which you would like to link a library to");
        }
        if (_.isEmpty(this.bitbucketRepositorySlug)) {
            const project = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);
            if (_.isEmpty(project.bitbucketProject)) {
                throw new QMError(`The selected project does not have an associated bitbucket project. Please first associate a bitbucket project using the \`${QMConfig.subatomic.commandPrefix} link bitbucket project\` command.`);
            }

            const bitbucketRepos = await this.bitbucketService.bitbucketRepositoriesForProjectKey(project.bitbucketProject.key);

            logger.debug(`Bitbucket project [${project.bitbucketProject.name}] has repositories: ${JSON.stringify(bitbucketRepos)}`);

            return await menuForBitbucketRepositories(
                ctx,
                bitbucketRepos,
                this,
                "Please select the Bitbucket repository which contains the library you want to link",
                "bitbucketRepositorySlug",
                "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/atlassian-bitbucket-logo.png",
            );
        }
    }
}
