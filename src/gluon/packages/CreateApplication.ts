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
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {
    bitbucketRepositoriesForProjectKey,
    bitbucketRepositoryForSlug,
    menuForBitbucketRepositories,
} from "../bitbucket/Bitbucket";
import {gluonMemberFromScreenName} from "../member/Members";
import {
    gluonProjectFromProjectName,
    gluonProjectsWhichBelongToGluonTeam,
    menuForProjects,
} from "../project/Projects";
import {logErrorAndReturnSuccess} from "../shared/Error";
import {RecursiveParameter, RecursiveParameterRequestCommand} from "../shared/RecursiveParameterRequestCommand";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo,
    menuForTeams,
} from "../team/Teams";
import {ApplicationType} from "./Applications";

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

    protected runCommand(ctx: HandlerContext) {
        // get memberId for createdBy
        return ctx.messageClient.addressChannels({
            text: "🚀 Your new library is being created...",
        }, this.teamChannel).then(() => {
                return gluonMemberFromScreenName(ctx, this.screenName)
                    .then(member => {

                        // get project by project name
                        // TODO this should be a drop down for the member to select projects
                        // that he is associated with via Teams
                        return gluonProjectFromProjectName(ctx, this.projectName)
                            .then(project => {
                                // update project by creating new Bitbucket project (new domain concept)
                                return axios.post(`${QMConfig.subatomic.gluon.baseUrl}/applications`,
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
                            });
                    }).catch(error => {
                        logErrorAndReturnSuccess(gluonProjectFromProjectName.name, error);
                    });
            },
        )
            .then(success)
            .catch(error => {
                return logErrorAndReturnSuccess(gluonMemberFromScreenName.name, error);
            });

    }

    protected setNextParameter(ctx: HandlerContext): Promise<HandlerResult> | void {
        if (_.isEmpty(this.teamName)) {
            return gluonTeamForSlackTeamChannel(this.teamChannel)
                .then(
                    team => {
                        this.teamName = team.name;
                        return this.setNextParameter(ctx)  || null;
                    },
                    () => {
                        return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName).then(teams => {
                            return menuForTeams(ctx, teams, this);
                        }).catch(error => {
                            logErrorAndReturnSuccess(gluonTeamsWhoSlackScreenNameBelongsTo.name, error);
                        });
                    },
                );
        }
        if (_.isEmpty(this.projectName)) {
            return gluonProjectsWhichBelongToGluonTeam(ctx, this.teamName)
                .then(projects => {
                    return menuForProjects(ctx, projects, this);
                }).catch(error => {
                    return logErrorAndReturnSuccess(gluonProjectsWhichBelongToGluonTeam.name, error);
                });
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

    protected runCommand(ctx: HandlerContext) {
        logger.debug(`Linking to Gluon project: ${this.projectName}`);

        return ctx.messageClient.addressChannels({
            text: "🚀 Your new application is being created...",
        }, this.teamChannel).then(() => {
                return this.linkApplicationForGluonProject(ctx,
                    this.screenName,
                    this.name,
                    this.description,
                    this.bitbucketRepositorySlug,
                    this.projectName);
            },
        );

    }

    protected setNextParameter(ctx: HandlerContext): Promise<HandlerResult> | void {
        if (_.isEmpty(this.teamName)) {
            return gluonTeamForSlackTeamChannel(this.teamChannel)
                .then(
                    team => {
                        this.teamName = team.name;
                        return this.setNextParameter(ctx)  || null;
                    },
                    () => {
                        return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName).then(teams => {
                            return menuForTeams(
                                ctx,
                                teams,
                                this,
                                "Please select a team, whose project you would like to link an application to");
                        }).catch(error => {
                            logErrorAndReturnSuccess(gluonTeamsWhoSlackScreenNameBelongsTo.name, error);
                        });
                    },
                );
        }
        if (_.isEmpty(this.projectName)) {
            return gluonProjectsWhichBelongToGluonTeam(ctx, this.teamName)
                .then(projects => {
                    return menuForProjects(
                        ctx,
                        projects,
                        this,
                        "Please select a project to which you would like to link an application to");
                }).catch(error => {
                    logErrorAndReturnSuccess(gluonProjectsWhichBelongToGluonTeam.name, error);
                });
        }
        if (_.isEmpty(this.bitbucketRepositorySlug)) {
            return gluonProjectFromProjectName(ctx, this.projectName)
                .then(project => {
                    if (_.isEmpty(project.bitbucketProject)) {
                        return ctx.messageClient.respond(`❗The selected project does not have an associated bitbucket project. Please first associate a bitbucket project using the \`${QMConfig.subatomic.commandPrefix} link bitbucket project\` command.`);
                    }
                    return bitbucketRepositoriesForProjectKey(project.bitbucketProject.key)
                        .then(bitbucketRepos => {
                            logger.debug(`Bitbucket project [${project.bitbucketProject.name}] has repositories: ${JSON.stringify(bitbucketRepos)}`);

                            return menuForBitbucketRepositories(
                                ctx,
                                bitbucketRepos,
                                this,
                                "Please select the Bitbucket repository which contains the application you want to link",
                                "bitbucketRepositorySlug",
                                "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/atlassian-bitbucket-logo.png",
                            );
                        });
                }).catch(error => {
                    logErrorAndReturnSuccess(gluonProjectFromProjectName.name, error);
                });
        }

    }

    private linkApplicationForGluonProject(ctx: HandlerContext,
                                           slackScreeName: string,
                                           applicationName: string,
                                           applicationDescription: string,
                                           bitbucketRepositorySlug: string,
                                           gluonProjectName: string): Promise<HandlerResult> {
        return gluonProjectFromProjectName(ctx, gluonProjectName)
            .then(project => {
                logger.debug(`Linking Bitbucket repository: ${bitbucketRepositorySlug}`);

                return this.linkBitbucketRepository(ctx,
                    slackScreeName,
                    applicationName,
                    applicationDescription,
                    bitbucketRepositorySlug,
                    project.bitbucketProject.key,
                    project.projectId);
            });
    }

    private linkBitbucketRepository(ctx: HandlerContext,
                                    slackScreeName: string,
                                    applicationName: string,
                                    applicationDescription: string,
                                    bitbucketRepositorySlug: string,
                                    bitbucketProjectKey: string,
                                    gluonProjectId: string): Promise<HandlerResult> {
        return bitbucketRepositoryForSlug(bitbucketProjectKey, bitbucketRepositorySlug)
            .then(repo => {
                return gluonMemberFromScreenName(ctx, slackScreeName)
                    .then(member => {
                        const remoteUrl = _.find(repo.links.clone, clone => {
                            return (clone as any).name === "ssh";
                        }) as any;
                        return axios.post(`${QMConfig.subatomic.gluon.baseUrl}/applications`,
                            {
                                name: applicationName,
                                description: applicationDescription,
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
                    })
                    .then(success)
                    .catch(error => {
                        return logErrorAndReturnSuccess(gluonMemberFromScreenName.name, error);
                    });
            });
    }

}
