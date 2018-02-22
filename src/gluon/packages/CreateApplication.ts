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
        description: "project name",
    })
    public projectName: string;

    @Parameter({
        description: "Bitbucket repository name",
    })
    public bitbucketRepositoryName: string;

    @Parameter({
        description: "Bitbucket repository URL",
    })
    public bitbucketRepositoryRepoUrl: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {

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
                return this.linkApplicationForGluonTeam(ctx,
                    this.screenName,
                    this.teamChannel,
                    this.name,
                    this.description,
                    this.bitbucketRepositorySlug,
                    this.projectName,
                    team.name);
            }, () => {
                if (!_.isEmpty(this.teamName)) {
                    logger.debug(`Linking existing application to projects for team: ${this.teamName}`);

                    return this.linkApplicationForGluonTeam(ctx,
                        this.screenName,
                        this.teamChannel,
                        this.name,
                        this.description,
                        this.bitbucketRepositorySlug,
                        this.projectName,
                        this.teamName);
                } else {
                    return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName)
                        .then(teams => {
                            return ctx.messageClient.respond({
                                text: "Please select a team, whose project you would like to link an application to",
                                attachments: [{
                                    fallback: "Please select a team, whose project you would like to link an application to",
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

    private linkApplicationForGluonTeam(ctx: HandlerContext,
                                        slackScreeName: string,
                                        teamSlackChannel: string,
                                        applicationName: string,
                                        applicationDescription: string,
                                        bitbucketRepositorySlug: string,
                                        gluonProjectName: string,
                                        gluonTeamName: string): Promise<HandlerResult> {
        if (!_.isEmpty(gluonProjectName)) {
            logger.debug(`Linking to Gluon project: ${gluonProjectName}`);

            return this.linkApplicationForGluonProject(ctx,
                slackScreeName,
                teamSlackChannel,
                applicationName,
                applicationDescription,
                bitbucketRepositorySlug,
                gluonProjectName);
        } else {
            return gluonProjectsWhichBelongToGluonTeam(ctx, gluonTeamName)
                .then(projects => {
                    return ctx.messageClient.respond({
                        text: "Please select a project to which you would like to link an application to",
                        attachments: [{
                            fallback: "Please select a project to which you would like to link an application to",
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

    private linkApplicationForGluonProject(ctx: HandlerContext,
                                           slackScreeName: string,
                                           teamSlackChannel: string,
                                           applicationName: string,
                                           applicationDescription: string,
                                           bitbucketRepositorySlug: string,
                                           gluonProjectName: string): Promise<HandlerResult> {
        return gluonProjectFromProjectName(ctx, gluonProjectName)
            .then(project => {
                if (!_.isEmpty(bitbucketRepositorySlug)) {
                    logger.debug(`Linking Bitbucket repository: ${bitbucketRepositorySlug}`);

                    return this.linkBitbucketRepository(ctx,
                        slackScreeName,
                        teamSlackChannel,
                        applicationName,
                        applicationDescription,
                        bitbucketRepositorySlug,
                        project.bitbucketProject.key,
                        project.projectId);
                } else {
                    return bitbucketRepositoriesForProjectKey(project.bitbucketProject.key)
                        .then(bitbucketRepos => {
                            logger.debug(`Bitbucket project [${project.bitbucketProject.name}] has repositories: ${JSON.stringify(bitbucketRepos.values)}`);
                            return ctx.messageClient.respond({
                                text: "Please select the Bitbucket repository which contains the application you want to link",
                                attachments: [{
                                    fallback: "Please select the Bitbucket repository which contains the application you want to link",
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
// Could parametize like this
// properties([
//   parameters([
//     string(description: "The OpenShift project Id of the team's DevOps project", name: 'devOpsProject'),
//     string(description: "The OpenShift project Id of project's DEV environment", name: 'devProject'),
//     string(description: "The OpenShift project Id of project's SIT environment", name: 'sitProject'),
//     string(description: "The OpenShift project Id of project's UAT environment", name: 'uatProject'),
//   ])
// ])

// TODO extract common stuff into shared libraries: https://jenkins.io/doc/book/pipeline/shared-libraries/

node('maven') {

  def teamDevOpsProject
  def projectDevProject
  def projectSitProject
  def projectUatProject

  withCredentials([
      string(credentialsId: 'devops-project', variable: 'DEVOPS_PROJECT_ID'),
      string(credentialsId: 'dev-project', variable: 'DEV_PROJECT_ID'),
      string(credentialsId: 'sit-project', variable: 'SIT_PROJECT_ID'),
      string(credentialsId: 'uat-project', variable: 'UAT_PROJECT_ID'),
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

  stage ('Checks and Tests') {
    final scmVars = checkout(scm)

    def shortGitCommit = scmVars.GIT_COMMIT[0..6]
    pom = readMavenPom file: 'pom.xml'
    tag = "\${pom.version}-\${shortGitCommit}"
    echo "Building application \${app}:\${tag} from commit \${scmVars} with BuildConfig \${appBuildConfig}"

    try {
      sh ': Maven build && ./mvnw --batch-mode test'
    } finally {
      junit 'target/surefire-reports/*.xml'
    }

    // TODO split unit and integration tests
  }

  if (env.BRANCH_NAME == 'master' || !env.BRANCH_NAME) {
    stage('OpenShift Build') {
      openshift.withProject(teamDevOpsProject) {
        def bc = openshift.selector("bc/\${appBuildConfig}")

        // TODO rebuilds will fail because you can't patch a unchanged patch :(
        // need to check if rebuild or if patched values are !=
        // OR check that the previous commit does not match the current commit:
        // Building application full-test:0.1.0.BUILD-SNAPSHOT-0f641cf from commit
        // [GIT_BRANCH:master, GIT_COMMIT:0f641cf6c8d1fa1e5b15aeedeed5ce2c40bb9a73,
        // GIT_PREVIOUS_COMMIT:5fb1ae6d0fbc67fb437cdaafca2f485ef22855fe,
        // GIT_PREVIOUS_SUCCESSFUL_COMMIT:5fb1ae6d0fbc67fb437cdaafca2f485ef22855fe,
        // GIT_URL:https://bitbucket.subatomic.local/scm/TEST/full-test.git] with BuildConfig test-project-full-test

        bc.patch("\\'{ \\"spec\\": { \\"output\\": { \\"to\\": { \\"name\\": \\"\${appBuildConfig}:\${tag}\\" } } } }\\'")
        def build = bc.startBuild();

        timeout(5) {
          build.untilEach(1) {
              return it.object().status.phase == "Complete"
          }
        }
      }
    }

    stage('Deploy to DEV') {
      sh ': Deploying to DEV...'

      openshift.withProject(teamDevOpsProject) {
        openshift.tag("\${teamDevOpsProject}/\${appBuildConfig}:\${tag}", "\${projectDevProject}/\${app}:\${tag}")
      }

      openshift.withProject(projectDevProject) {
        openshift.selector('dc', app).patch("\\'{ \\"spec\\": { \\"triggers\\": [{ \\"type\\": \\"ImageChange\\", \\"imageChangeParams\\": { \\"automatic\\": false, \\"containerNames\\": [\\"\${app}\\"], \\"from\\": { \\"kind\\": \\"ImageStreamTag\\", \\"name\\": \\"\${app}:\${tag}\\" } } }] } }\\'")

        timeout(5) {
          openshift.selector('dc', app).rollout().latest()

          // TODO if the replicas is zero, then don't wait
          def deploymentObject = openshift.selector('dc', app).object()
          if (deploymentObject.spec.replicas > 0) {
            def podSelector = openshift.selector('pod', [deployment: "\${app}-\${deploymentObject.status.latestVersion}"])
            podSelector.untilEach {
              echo "Deployment [\${deploymentObject.status.latestVersion}] with Pod [\${it.object().metadata.name}] is ready?: \${it.object().status.containerStatuses[0].ready}"
              return it.object().status.containerStatuses[0].ready
            }
          } else {
              echo "Deployment has a replica count of 0. Not waiting for Pods to become healthy..."
          }
        }
      }
    }

    stage('Deploy to SIT') {
      sh ': Deploying to SIT...'

      openshift.withProject(projectDevProject) {
        openshift.tag("\${projectDevProject}/\${app}:\${tag}", "\${projectSitProject}/\${app}:\${tag}")
      }

      openshift.withProject(projectSitProject) {
        openshift.selector('dc', app).patch("\\'{ \\"spec\\": { \\"triggers\\": [{ \\"type\\": \\"ImageChange\\", \\"imageChangeParams\\": { \\"automatic\\": false, \\"containerNames\\": [\\"\${app}\\"], \\"from\\": { \\"kind\\": \\"ImageStreamTag\\", \\"name\\": \\"\${app}:\${tag}\\" } } }] } }\\'")

        timeout(5) {
          openshift.selector('dc', app).rollout().latest()

          def deploymentObject = openshift.selector('dc', app).object()
          if (deploymentObject.spec.replicas > 0) {
            def podSelector = openshift.selector('pod', [deployment: "\${app}-\${deploymentObject.status.latestVersion}"])
            podSelector.untilEach {
              echo "Deployment [\${deploymentObject.status.latestVersion}] with Pod [\${it.object().metadata.name}] is ready?: \${it.object().status.containerStatuses[0].ready}"
              return it.object().status.containerStatuses[0].ready
            }
          } else {
              echo "Deployment has a replica count of 0. Not waiting for Pods to become healthy..."
          }
        }
      }
    }

    stage('Deploy to UAT') {
      sh ': Deploying to UAT...'

      input "Confirm deployment to UAT"

      openshift.withProject(projectSitProject) {
        openshift.tag("\${projectSitProject}/\${app}:\${tag}", "\${projectUatProject}/\${app}:\${tag}")
      }

      openshift.withProject(projectUatProject) {
        openshift.selector('dc', app).patch("\\'{ \\"spec\\": { \\"triggers\\": [{ \\"type\\": \\"ImageChange\\", \\"imageChangeParams\\": { \\"automatic\\": false, \\"containerNames\\": [\\"\${app}\\"], \\"from\\": { \\"kind\\": \\"ImageStreamTag\\", \\"name\\": \\"\${app}:\${tag}\\" } } }] } }\\'")

        timeout(5) {
          openshift.selector('dc', app).rollout().latest()

          def deploymentObject = openshift.selector('dc', app).object()
          if (deploymentObject.spec.replicas > 0) {
            def podSelector = openshift.selector('pod', [deployment: "\${app}-\${deploymentObject.status.latestVersion}"])
            podSelector.untilEach {
              echo "Deployment [\${deploymentObject.status.latestVersion}] with Pod [\${it.object().metadata.name}] is ready?: \${it.object().status.containerStatuses[0].ready}"
              return it.object().status.containerStatuses[0].ready
            }
          } else {
              echo "Deployment has a replica count of 0. Not waiting for Pods to become healthy..."
          }
        }
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
