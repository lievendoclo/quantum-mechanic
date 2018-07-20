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
import {
    BitbucketService,
    menuForBitbucketRepositories,
} from "../../util/bitbucket/Bitbucket";
import {MemberService} from "../../util/member/Members";
import {
    ApplicationService,
    ApplicationType,
} from "../../util/packages/Applications";
import {PackageCommandService} from "../../util/packages/PackageCommandService";
import {
    menuForProjects,
    ProjectService,
} from "../../util/project/ProjectService";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/shared/RecursiveParameterRequestCommand";
import {menuForTeams, TeamService} from "../../util/team/TeamService";

@CommandHandler("Link an existing application", QMConfig.subatomic.commandPrefix + " link application")
export class LinkExistingApplication extends RecursiveParameterRequestCommand {

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
        description: "team name",
        required: false,
        displayable: false,
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

    constructor(private teamService = new TeamService(),
                private projectService = new ProjectService(),
                private memberService = new MemberService(),
                private bitbucketService = new BitbucketService(),
                private applicationService = new ApplicationService(),
                private packageCommandService = new PackageCommandService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {

        logger.debug(`Linking to Gluon project: ${this.projectName}`);

        try {
            await ctx.messageClient.respond({
                text: "🚀 Your new application is being created...",
            });

            return await this.packageCommandService.linkBitbucketRepoToGluonPackage(
                this.screenName,
                this.name,
                this.description,
                this.bitbucketRepositorySlug,
                this.projectName,
                ApplicationType.DEPLOYABLE,
            );
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected async setNextParameter(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
            try {
                const team = await this.teamService.gluonTeamForSlackTeamChannel(this.teamChannel);
                this.teamName = team.name;
                return await this.handle(ctx);
            } catch (error) {
                const teams = await this.teamService.gluonTeamsWhoSlackScreenNameBelongsTo(this.screenName);
                return menuForTeams(
                    ctx,
                    teams,
                    this,
                    "Please select a team, whose project you would like to link a library to");

            }
        }
        if (_.isEmpty(this.projectName)) {
            const projects = await this.projectService.gluonProjectsWhichBelongToGluonTeam(this.teamName);
            return menuForProjects(
                ctx,
                projects,
                this,
                "Please select a project to which you would like to link a library to");
        }
        if (_.isEmpty(this.bitbucketRepositorySlug)) {
            const project = await this.projectService.gluonProjectFromProjectName(this.projectName);
            if (_.isEmpty(project.bitbucketProject)) {
                return await ctx.messageClient.respond(`❗The selected project does not have an associated bitbucket project. Please first associate a bitbucket project using the \`${QMConfig.subatomic.commandPrefix} link bitbucket project\` command.`);
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
