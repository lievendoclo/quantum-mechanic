import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import {BitBucketServerRepoRef} from "@atomist/automation-client/operations/common/BitBucketServerRepoRef";
import {GitCommandGitProject} from "@atomist/automation-client/project/git/GitCommandGitProject";
import {GitProject} from "@atomist/automation-client/project/git/GitProject";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {QMTemplate} from "../../template/QMTemplate";
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
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo,
    menuForTeams,
} from "../team/Teams";
import {ApplicationType} from "./Applications";

@CommandHandler("Link an existing library", QMConfig.subatomic.commandPrefix + " link library")
export class LinkExistingLibrary implements HandleCommand<HandlerResult> {

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
        required: false,
        displayable: false,
    })
    public teamName: string;

    @Parameter({
        description: "project name",
        displayable: false,
        required: false,
    })
    public projectName: string;

    @Parameter({
        description: "Bitbucket repository slug",
        displayable: false,
        required: false,
    })
    public bitbucketRepositorySlug: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.projectName) || _.isEmpty(this.bitbucketRepositorySlug)) {
            return this.requestUnsetParameters(ctx);
        }

        return this.linkLibraryForGluonProject(
            ctx,
            this.screenName,
            this.teamChannel,
            this.name,
            this.description,
            this.bitbucketRepositorySlug,
            this.projectName,
        );
    }

    private requestUnsetParameters(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
            return gluonTeamForSlackTeamChannel(this.teamChannel)
                .then(
                    team => {
                        this.teamName = team.name;
                        return this.requestUnsetParameters(ctx);
                    },
                    () => {
                        return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName).then(teams => {
                            return menuForTeams(
                                ctx,
                                teams,
                                this,
                                "Please select a team, whose project you would like to link a library to");
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
                        "Please select a project to which you would like to link a library to");
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
                                "Please select the Bitbucket repository which contains the library you want to link",
                                "bitbucketRepositorySlug",
                                "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/atlassian-bitbucket-logo.png",
                            );
                        });
                }).catch(error => {
                    logErrorAndReturnSuccess(gluonProjectFromProjectName.name, error);
                });
        }

    }

    private linkLibraryForGluonProject(ctx: HandlerContext,
                                       slackScreeName: string,
                                       teamSlackChannel: string,
                                       libraryName: string,
                                       libraryDescription: string,
                                       bitbucketRepositorySlug: string,
                                       gluonProjectName: string): Promise<HandlerResult> {
        return gluonProjectFromProjectName(ctx, gluonProjectName)
            .then(project => {
                logger.debug(`Linking Bitbucket repository: ${bitbucketRepositorySlug}`);

                return this.linkBitbucketRepository(ctx,
                    slackScreeName,
                    teamSlackChannel,
                    libraryName,
                    libraryDescription,
                    bitbucketRepositorySlug,
                    project.bitbucketProject.key,
                    project.projectId);
            });
    }

    private linkBitbucketRepository(ctx: HandlerContext,
                                    slackScreeName: string,
                                    teamSlackChannel: string,
                                    libraryName: string,
                                    libraryDescription: string,
                                    bitbucketRepositorySlug: string,
                                    bitbucketProjectKey: string,
                                    gluonProjectId: string): Promise<HandlerResult> {
        return bitbucketRepositoryForSlug(bitbucketProjectKey, bitbucketRepositorySlug)
            .then(repo => {
                const username = QMConfig.subatomic.bitbucket.auth.username;
                const password = QMConfig.subatomic.bitbucket.auth.password;
                return GitCommandGitProject.cloned({
                        username,
                        password,
                    },
                    new BitBucketServerRepoRef(
                        QMConfig.subatomic.bitbucket.baseUrl.replace(/^(https?:|)\/\//, ""),
                        bitbucketProjectKey,
                        bitbucketRepositorySlug))
                    .then((project: GitProject) => {
                        return project.findFile("Jenkinsfile")
                            .catch(() => {
                                logger.warn("Doesn't exist, add it!");

                                const jenkinsTemplate: QMTemplate = new QMTemplate("templates/jenkins/jenkinsfile-library.groovy", true);
                                return project.addFile("Jenkinsfile",
                                    jenkinsTemplate.build({}));
                            })
                            .then(() => {
                                return project.isClean()
                                    .then(clean => {
                                        logger.debug(`Jenkinsfile has been added: ${clean.success}`);

                                        if (!clean.success) {
                                            return project.setUserConfig(
                                                QMConfig.subatomic.bitbucket.auth.username,
                                                QMConfig.subatomic.bitbucket.auth.email,
                                            )
                                                .then(() => project.commit(`Added Jenkinsfile`))
                                                .then(() => project.push());
                                        } else {
                                            logger.debug("Jenkinsfile already exists");
                                            return clean;
                                        }
                                    });
                            });
                    })
                    .then(() => {
                        return gluonMemberFromScreenName(ctx, slackScreeName)
                            .then(member => {
                                return axios.post(`${QMConfig.subatomic.gluon.baseUrl}/applications`,
                                    {
                                        name: libraryName,
                                        description: libraryDescription,
                                        applicationType: ApplicationType.LIBRARY,
                                        projectId: gluonProjectId,
                                        createdBy: member.memberId,
                                    })
                                    .then(library => {
                                        const remoteUrl = _.find(repo.links.clone, clone => {
                                            return (clone as any).name === "ssh";
                                        }) as any;

                                        return axios.put(library.headers.location,
                                            {
                                                projectId: gluonProjectId,
                                                bitbucketRepository: {
                                                    bitbucketId: repo.id,
                                                    name: repo.name,
                                                    slug: bitbucketRepositorySlug,
                                                    remoteUrl: remoteUrl.href,
                                                    repoUrl: repo.links.self[0].href,
                                                },
                                                createdBy: member.memberId,
                                            });
                                    });
                            })
                            .then(() => {
                                return ctx.messageClient.addressChannels({
                                    text: "🚀 Your new library is being provisioned...",
                                }, teamSlackChannel);
                            }).catch(error => {
                                logErrorAndReturnSuccess(gluonMemberFromScreenName.name, error);
                            });
                    });
            });
    }
}
