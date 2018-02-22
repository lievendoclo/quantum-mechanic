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
import {menuForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {
    bitbucketRepositoriesForProjectKey,
    bitbucketRepositoryForSlug,
} from "../bitbucket/Bitbucket";
import {gluonMemberFromScreenName} from "../member/Members";
import {
    gluonProjectFromProjectName,
    gluonProjectsWhichBelongToGluonTeam,
} from "../project/Projects";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo,
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
        description: "Bitbucket repository name",
        displayable: false,
        required: false,
    })
    public bitbucketRepositoryName: string;

    @Parameter({
        description: "Bitbucket repository slug",
        displayable: false,
        required: false,
    })
    public bitbucketRepositorySlug: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        return gluonTeamForSlackTeamChannel(this.teamChannel)
            .then(team => {
                return this.linkLibraryForGluonTeam(
                    ctx,
                    this.screenName,
                    this.teamChannel,
                    this.name,
                    this.description,
                    this.bitbucketRepositorySlug,
                    this.projectName,
                    team.name,
                );
            }, () => {
                if (!_.isEmpty(this.teamName)) {
                    logger.debug(`Linking existing library to projects for team: ${this.teamName}`);

                    return this.linkLibraryForGluonTeam(
                        ctx,
                        this.screenName,
                        this.teamChannel,
                        this.name,
                        this.description,
                        this.bitbucketRepositorySlug,
                        this.projectName,
                        this.teamName,
                    );
                } else {
                    return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName)
                        .then(teams => {
                            return ctx.messageClient.respond({
                                text: "Please select a team, whose project you would like to link an library to",
                                attachments: [{
                                    fallback: "Please select a team, whose project you would like to link an library to",
                                    actions: [
                                        menuForCommand({
                                                text: "Select Team", options:
                                                    teams.map(team => {
                                                        return {
                                                            value: team.name,
                                                            text: team.name,
                                                        };
                                                    }),
                                            },
                                            this, "teamName"),
                                    ],
                                }],
                            });
                        });
                }
            });
    }

    private linkLibraryForGluonTeam(ctx: HandlerContext,
                                    slackScreeName: string,
                                    teamSlackChannel: string,
                                    libraryName: string,
                                    libraryDescription: string,
                                    bitbucketRepositorySlug: string,
                                    gluonProjectName: string,
                                    gluonTeamName: string): Promise<HandlerResult> {
        if (!_.isEmpty(gluonProjectName)) {
            logger.debug(`Linking to Gluon project: ${gluonProjectName}`);

            return this.linkLibraryForGluonProject(ctx,
                slackScreeName,
                teamSlackChannel,
                libraryName,
                libraryDescription,
                bitbucketRepositorySlug,
                gluonProjectName);
        } else {
            return gluonProjectsWhichBelongToGluonTeam(ctx, gluonTeamName)
                .then(projects => {
                    return ctx.messageClient.respond({
                        text: "Please select a project to which you would like to link an library to",
                        attachments: [{
                            fallback: "Please select a project to which you would like to link an library to",
                            actions: [
                                menuForCommand({
                                        text: "Select Project", options:
                                            projects.map(project => {
                                                return {
                                                    value: project.name,
                                                    text: project.name,
                                                };
                                            }),
                                    },
                                    this, "projectName"),
                            ],
                        }],
                    });
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
                if (!_.isEmpty(bitbucketRepositorySlug)) {
                    logger.debug(`Linking Bitbucket repository: ${bitbucketRepositorySlug}`);

                    return this.linkBitbucketRepository(ctx,
                        slackScreeName,
                        teamSlackChannel,
                        libraryName,
                        libraryDescription,
                        bitbucketRepositorySlug,
                        project.bitbucketProject.key,
                        project.projectId);
                } else {
                    return bitbucketRepositoriesForProjectKey(project.bitbucketProject.key)
                        .then(bitbucketRepos => {
                            logger.debug(`Bitbucket project [${project.bitbucketProject.name}] has repositories: ${JSON.stringify(bitbucketRepos.values)}`);
                            return ctx.messageClient.respond({
                                text: "Please select the Bitbucket repository which contains the library you want to link",
                                attachments: [{
                                    fallback: "Please select the Bitbucket repository which contains the library you want to link",
                                    actions: [
                                        menuForCommand({
                                                text: "Select Bitbucket repository",
                                                options:
                                                    bitbucketRepos.values.map(bitbucketRepo => {
                                                        return {
                                                            value: bitbucketRepo.name,
                                                            text: bitbucketRepo.name,
                                                        };
                                                    }),
                                            },
                                            this, "bitbucketRepositorySlug"),
                                    ],
                                }],
                            });
                        });
                }
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
                                return project.addFile("Jenkinsfile",
                                    `
node('maven') {

    withCredentials([
            string(credentialsId: 'nexus-base-url', variable: 'NEXUS_BASE_URL'),
            file(credentialsId: 'maven-settings', variable: 'MVN_SETTINGS'),
    ]) {
        stage('Checks and Tests') {
            checkout(scm)

            try {
                sh ': Maven build && ./mvnw --batch-mode verify --settings $MVN_SETTINGS'
            } finally {
                junit 'target/surefire-reports/*.xml'
            }
        }

        if (env.BRANCH_NAME == 'master' || !env.BRANCH_NAME) {
            stage('Publish to Nexus') {
                repository = 'releases'
                pom = readMavenPom file: 'pom.xml'
                if (pom.version.endsWith('SNAPSHOT')) {
                    repository = 'snapshots'
                }

                sh ': Maven deploy && ./mvnw --batch-mode deploy -DskipTests ' +
                        "-DaltDeploymentRepository=nexus::default::\${env.NEXUS_BASE_URL}/\${repository}/ " +
                        '--settings $MVN_SETTINGS'
            }
        }
    }
}
`);
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
                            });
                    });
            });
    }
}
