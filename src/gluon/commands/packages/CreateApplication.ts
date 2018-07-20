import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    success,
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
import {
    menuForProjects,
    ProjectService,
} from "../../util/project/ProjectService";
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
import {menuForTeams, TeamService} from "../../util/team/TeamService";

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

    constructor(private teamService = new TeamService(),
                private projectService = new ProjectService(),
                private memberService = new MemberService(),
                private applicationService = new ApplicationService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        // get memberId for createdBy
        try {
            await ctx.messageClient.respond({
                text: "🚀 Your new application is being created...",
            });

            const member = await this.memberService.gluonMemberFromScreenName(this.screenName);

            const project = await this.projectService.gluonProjectFromProjectName(this.projectName);

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
                const team = await this.teamService.gluonTeamForSlackTeamChannel(this.teamChannel);
                this.teamName = team.name;
                return await this.handle(ctx);
            } catch (error) {
                const teams = await this.teamService.gluonTeamsWhoSlackScreenNameBelongsTo(this.screenName);
                return await menuForTeams(ctx, teams, this);
            }
        }
        if (_.isEmpty(this.projectName)) {
            const projects = await this.projectService.gluonProjectsWhichBelongToGluonTeam(this.teamName);
            return await menuForProjects(ctx, projects, this);
        }
    }

    private async createApplicationInGluon(project, member) {
        const createApplicationResult = await this.applicationService.createGluonApplication(
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
                private applicationService = new ApplicationService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {

        logger.debug(`Linking to Gluon project: ${this.projectName}`);

        try {
            await ctx.messageClient.respond({
                text: "🚀 Your new application is being created...",
            });

            return await this.linkApplicationForGluonProject(
                this.screenName,
                this.name,
                this.description,
                this.bitbucketRepositorySlug,
                this.projectName,
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

    private async linkApplicationForGluonProject(slackScreeName: string,
                                                 applicationName: string,
                                                 applicationDescription: string,
                                                 bitbucketRepositorySlug: string,
                                                 gluonProjectName: string): Promise<HandlerResult> {
        const project = await this.projectService.gluonProjectFromProjectName(gluonProjectName);
        logger.debug(`Linking Bitbucket repository: ${bitbucketRepositorySlug}`);

        return await this.linkBitbucketRepository(
            slackScreeName,
            applicationName,
            applicationDescription,
            bitbucketRepositorySlug,
            project.bitbucketProject.key,
            project.projectId);
    }

    private async linkBitbucketRepository(slackScreeName: string,
                                          libraryName: string,
                                          libraryDescription: string,
                                          bitbucketRepositorySlug: string,
                                          bitbucketProjectKey: string,
                                          gluonProjectId: string): Promise<HandlerResult> {
        const repoResult = await this.bitbucketService.bitbucketRepositoryForSlug(bitbucketProjectKey, bitbucketRepositorySlug);

        if (!isSuccessCode(repoResult.status)) {
            throw new QMError("Unable to find the specified repository in Bitbucket. Please make sure it exists.");
        }

        const repo = repoResult.data;

        const member = await this.memberService.gluonMemberFromScreenName(slackScreeName);

        const remoteUrl = _.find(repo.links.clone, clone => {
            return (clone as any).name === "ssh";
        }) as any;

        const createApplicationResult = await this.applicationService.createGluonApplication(
            {
                name: libraryName,
                description: libraryDescription,
                applicationType: ApplicationType.DEPLOYABLE,
                projectId: gluonProjectId,
                createdBy: member.memberId,
                bitbucketRepository: {
                    bitbucketId: repo.id,
                    name: repo.name,
                    slug: bitbucketRepositorySlug,
                    remoteUrl: remoteUrl.href,
                    repoUrl: repo.links.self[0].href,
                },
                requestConfiguration: true,
            });

        if (!isSuccessCode(createApplicationResult.status)) {
            logger.error(`Failed to link package. Error: ${JSON.stringify(createApplicationResult)}`);
            throw new QMError("❗Failed to link the specified package.");
        }

        return await success();
    }
}
