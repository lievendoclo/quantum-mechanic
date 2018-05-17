import {
    CommandHandler, failure,
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
    bitbucketRepositoryForSlug, menuForBitbucketRepositories,
} from "../bitbucket/Bitbucket";
import {gluonMemberFromScreenName} from "../member/Members";
import {
    gluonProjectFromProjectName,
    gluonProjectsWhichBelongToGluonTeam, menuForProjects,
} from "../project/Projects";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo, menuForTeams,
} from "../team/Teams";
import {ApplicationType} from "./Applications";
import isEmpty = hbs.Utils.isEmpty;

@CommandHandler("Create a new Bitbucket project", QMConfig.subatomic.commandPrefix + " create bitbucket project")
export class CreateApplication implements HandleCommand<HandlerResult> {

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

    @Parameter({
        description: "project name",
        displayable: false,
        required: false,
    })
    public projectName: string;

    @Parameter({
        description: "team name",
        displayable: false,
        required: false,
    })
    public teamName: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {

        if (_.isEmpty(this.teamName) || _.isEmpty(this.projectName)) {
            return this.requestUnsetParameters(ctx);
        }
        // get memberId for createdBy
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
                            })
                            .then(application => {
                                return axios.put(application.headers.location,
                                    {
                                        projectId: project.projectId,
                                        bitbucketRepository: {
                                            name: this.bitbucketRepositoryName,
                                            repoUrl: this.bitbucketRepositoryRepoUrl,
                                        },
                                        createdBy: member.memberId,
                                    });
                            });
                    });
            })
            .then(() => {
                return ctx.messageClient.addressChannels({
                    text: "🚀 Your new application is being provisioned...",
                }, this.teamChannel);
            });
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
                            return menuForTeams(ctx, teams, this);
                        });
                    },
                );
        }
        if (_.isEmpty(this.projectName)) {
            return gluonProjectsWhichBelongToGluonTeam(ctx, this.teamName)
                .then(projects => {
                    return menuForProjects(ctx, projects, this);
                });
        }
    }
}

@CommandHandler("Link an existing application", QMConfig.subatomic.commandPrefix + " link application")
export class LinkExistingApplication implements HandleCommand<HandlerResult> {

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

        if (_.isEmpty(this.projectName) || _.isEmpty(this.teamName) || _.isEmpty(this.bitbucketRepositorySlug)) {
            return this.requestUnsetParameters(ctx);
        }

        logger.debug(`Linking to Gluon project: ${this.projectName}`);

        return this.linkApplicationForGluonProject(ctx,
            this.screenName,
            this.teamChannel,
            this.name,
            this.description,
            this.bitbucketRepositorySlug,
            this.projectName);
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
                                "Please select a team, whose project you would like to link an application to");
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
                });
        }

    }

    private linkApplicationForGluonProject(ctx: HandlerContext,
                                           slackScreeName: string,
                                           teamSlackChannel: string,
                                           applicationName: string,
                                           applicationDescription: string,
                                           bitbucketRepositorySlug: string,
                                           gluonProjectName: string): Promise<HandlerResult> {
        return gluonProjectFromProjectName(ctx, gluonProjectName)
            .then(project => {
                logger.debug(`Linking Bitbucket repository: ${bitbucketRepositorySlug}`);

                return this.linkBitbucketRepository(ctx,
                    slackScreeName,
                    teamSlackChannel,
                    applicationName,
                    applicationDescription,
                    bitbucketRepositorySlug,
                    project.bitbucketProject.key,
                    project.projectId);
            });
    }

    private linkBitbucketRepository(ctx: HandlerContext,
                                    slackScreeName: string,
                                    teamSlackChannel: string,
                                    applicationName: string,
                                    applicationDescription: string,
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
/**
 * Jenkins pipeline to build an application with the GitHub flow in mind (https://guides.github.com/introduction/flow/).
 *
 * This pipeline requires the following credentials:
 * ---
 * Type          | ID                | Description
 * Secret text   | devops-project    | The OpenShift project Id of the DevOps project that this Jenkins instance is running in
 * Secret text   | dev-project       | The OpenShift project Id of the project's development environment
 * Secret text   | sit-project       | The OpenShift project Id of the project's sit environment
 * Secret text   | uat-project       | The OpenShift project Id of the project's uat environment
 *
 */

def deploy(project, app, tag) {
    openshift.withProject(project) {
        def dc = openshift.selector('dc', app);
        for (trigger in dc.object().spec.triggers) {
            if (trigger.type == "ImageChange") {
                def imageStreamName = trigger.imageChangeParams.from.name
                echo "Current ImageStream tag: \${imageStreamName}"
                echo "New ImageStream tag: \${app}:\${tag}"
                if (imageStreamName != "\${app}:\${tag}") {
                    openshift.selector('dc', app).patch("\\'{ \\"spec\\": { \\"triggers\\": [{ \\"type\\": \\"ImageChange\\", \\"imageChangeParams\\": { \\"automatic\\": false, \\"containerNames\\": [\\"\${app}\\"], \\"from\\": { \\"kind\\": \\"ImageStreamTag\\", \\"name\\": \\"\${app}:\${tag}\\" } } }] } }\\'")
                }
                break
            }
            openshift.selector('dc', app).rollout().latest()

            timeout(5) {
                def deploymentObject = openshift.selector('dc', "\${app}").object()
                if (deploymentObject.spec.replicas > 0) {
                    def latestDeploymentVersion = deploymentObject.status.latestVersion
                    def replicationController = openshift.selector('rc', "\${app}-\${latestDeploymentVersion}")
                    replicationController.untilEach(1) {
                        def replicationControllerMap = it.object()
                        echo "Replicas: \${replicationControllerMap.status.readyReplicas}"
                        return (replicationControllerMap.status.replicas.equals(replicationControllerMap.status.readyReplicas))
                    }
                } else {
                    echo "Deployment has a replica count of 0. Not waiting for Pods to become healthy..."
                }
            }
        }
    }
}

node('maven') {

    def teamDevOpsProject
    def projectDevProject
    def projectSitProject
    def projectUatProject

    withCredentials([
            string(credentialsId: 'devops-project', variable: 'DEVOPS_PROJECT_ID'),
            string(credentialsId: 'dev-project', variable: 'DEV_PROJECT_ID'),
            string(credentialsId: 'sit-project', variable: 'SIT_PROJECT_ID'),
            string(credentialsId: 'uat-project', variable: 'UAT_PROJECT_ID')
    ]) {
        teamDevOpsProject = "\${env.DEVOPS_PROJECT_ID}"
        projectDevProject = "\${env.DEV_PROJECT_ID}"
        projectSitProject = "\${env.SIT_PROJECT_ID}"
        projectUatProject = "\${env.UAT_PROJECT_ID}"
    }

    def project = "\${env.JOB_NAME.split('/')[0]}"
    def app = "\${env.JOB_NAME.split('/')[1]}"
    def appBuildConfig = "\${project}-\${app}"

    def tag

    stage('Checks and Tests') {
        final scmVars = checkout(scm)

        def shortGitCommit = scmVars.GIT_COMMIT[0..6]
        def pom = readMavenPom file: 'pom.xml'
        tag = "\${pom.version}-\${shortGitCommit}"
        echo "Building application \${app}:\${tag} from commit \${scmVars} with BuildConfig \${appBuildConfig}"

        try {
            withCredentials([
                    file(credentialsId: 'maven-settings', variable: 'MVN_SETTINGS')
            ]) {
                sh ': Maven build &&' +
                        " ./mvnw --batch-mode test --settings $MVN_SETTINGS" +
                        " || mvn --batch-mode test --settings $MVN_SETTINGS" +
                        ' -Dorg.slf4j.simpleLogger.log.org.apache.maven.cli.transfer.Slf4jMavenTransferListener=warn' +
                        ' -Dmaven.test.redirectTestOutputToFile=true'
            }
        } finally {
            junit 'target/surefire-reports/*.xml'
        }

        // TODO split unit and integration tests
    }

    if (env.BRANCH_NAME == 'master' || !env.BRANCH_NAME) {
        stage('OpenShift Build') {
            openshift.withProject(teamDevOpsProject) {
                def bc = openshift.selector("bc/\${appBuildConfig}")

                def buildConfig = bc.object()
                def outputImage = buildConfig.spec.output.to.name
                echo "Current tag: \${outputImage}"
                if (outputImage != "\${appBuildConfig}:\${tag}") {
                    bc.patch("\\'{ \\"spec\\": { \\"output\\": { \\"to\\": { \\"name\\": \\"\${appBuildConfig}:\${tag}\\" } } } }\\'")
                    def build = bc.startBuild();
                    timeout(5) {
                        build.untilEach(1) {
                            return it.object().status.phase == "Complete"
                        }
                    }
                }
            }
        }

        stage('Deploy to DEV') {
            sh ': Deploying to DEV...'

            openshift.withProject(teamDevOpsProject) {
                openshift.tag("\${teamDevOpsProject}/\${appBuildConfig}:\${tag}", "\${projectDevProject}/\${app}:\${tag}")
            }

            deploy(projectDevProject, app, tag);
        }

        stage('Deploy to SIT') {
            sh ': Deploying to SIT...'

            openshift.withProject(projectDevProject) {
                openshift.tag("\${projectDevProject}/\${app}:\${tag}", "\${projectSitProject}/\${app}:\${tag}")
            }

            deploy(projectSitProject, app, tag)
        }

        stage('Deploy to UAT') {
            sh ': Deploying to UAT...'

            input "Confirm deployment to UAT"

            openshift.withProject(projectSitProject) {
                openshift.tag("\${projectSitProject}/\${app}:\${tag}", "\${projectUatProject}/\${app}:\${tag}")
            }

            deploy(projectUatProject, app, tag);
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
                                        name: applicationName,
                                        description: applicationDescription,
                                        applicationType: ApplicationType.DEPLOYABLE,
                                        projectId: gluonProjectId,
                                        createdBy: member.memberId,
                                    })
                                    .then(application => {
                                        const remoteUrl = _.find(repo.links.clone, clone => {
                                            return (clone as any).name === "ssh";
                                        }) as any;

                                        return axios.put(application.headers.location,
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
                                    text: "🚀 Your new application is being provisioned...",
                                }, teamSlackChannel);
                            });
                    });
            });
    }
}
