import {
    EventFired,
    EventHandler,
    failure,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    success,
    SuccessPromise,
} from "@atomist/automation-client";
import axios from "axios";
import * as fs from "fs";
import * as https from "https";
import * as _ from "lodash";
import * as path from "path";
import {SimpleOption} from "../../openshift/base/options/SimpleOption";
import {OCCommon} from "../../openshift/OCCommon";

@EventHandler("Receive ApplicationCreatedEvent events", `
subscription ApplicationCreatedEvent {
  ApplicationCreatedEvent {
    id
    application {
      applicationId
      name
      description
    }
    project {
      projectId
      name
      description
    }
    bitbucketRepository {
      id
      name
      repoUrl
      remoteUrl
    }
    bitbucketProject {
      id
      key
      name
      description
      url
    }
    teams {
      teamId
      name
      slackIdentity {
        teamChannel
      }
    }
    requestedBy {
      firstName
      slackIdentity {
        screenName
      }
    }
  }
}
`)
export class ApplicationCreated implements HandleEvent<any> {

    public handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested ApplicationCreated event: ${JSON.stringify(event.data)}`);

        const applicationCreatedEvent = event.data.ApplicationCreatedEvent[0];

        // TODO a project should have an owning team
        // this is the Jenkins instance that should be used for the project folder etc.
        const teamDevOpsProjectId = `${_.kebabCase(applicationCreatedEvent.teams[0].name).toLowerCase()}-devops`;
        logger.debug(`Using owning team DevOps project: ${teamDevOpsProjectId}`);

        return OCCommon.commonCommand("serviceaccounts",
            "get-token",
            [
                "subatomic-jenkins",
            ], [
                new SimpleOption("-namespace", teamDevOpsProjectId),
            ])
            .then(token => {
                return OCCommon.commonCommand(
                    "get",
                    "route/jenkins",
                    [],
                    [
                        new SimpleOption("-output", "jsonpath={.spec.host}"),
                        new SimpleOption("-namespace", teamDevOpsProjectId),
                    ])
                    .then(jenkinsHost => {
                        logger.debug(`Using Jenkins Route host [${jenkinsHost.output}] to add Bitbucket credentials`);

                        const jenkinsAxios = axios.create({
                            httpsAgent: new https.Agent({
                                rejectUnauthorized: false,
                            }),
                        });

                        return jenkinsAxios.post(`https://${jenkinsHost.output}/job/${_.kebabCase(applicationCreatedEvent.project.name).toLowerCase()}/createItem?name=${_.kebabCase(applicationCreatedEvent.application.name).toLowerCase()}`,
                            `
<org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject plugin="workflow-multibranch@2.14">
  <description>${applicationCreatedEvent.application.name} pipelines [[managed by Subatomic](https://docs.subatomic.bison.absa.co.za/projects/${encodeURI(applicationCreatedEvent.project.name)})]</description>
  <displayName>${applicationCreatedEvent.application.name}</displayName>
  <sources class="jenkins.branch.MultiBranchProject$BranchSourceList" plugin="branch-api@2.0.18">
  <data>
    <jenkins.branch.BranchSource>
      <source class="com.cloudbees.jenkins.plugins.bitbucket.BitbucketSCMSource" plugin="cloudbees-bitbucket-branch-source@2.2.8">
        <serverUrl>https://bitbucket.core.local</serverUrl>
        <credentialsId>${teamDevOpsProjectId}-bitbucket</credentialsId>
        <repoOwner>${applicationCreatedEvent.bitbucketProject.key}</repoOwner>
        <repository>${applicationCreatedEvent.bitbucketRepository.name}</repository>
          <traits>
            <com.cloudbees.jenkins.plugins.bitbucket.BranchDiscoveryTrait>
              <strategyId>3</strategyId>
            </com.cloudbees.jenkins.plugins.bitbucket.BranchDiscoveryTrait>
            <com.cloudbees.jenkins.plugins.bitbucket.OriginPullRequestDiscoveryTrait>
              <strategyId>1</strategyId>
            </com.cloudbees.jenkins.plugins.bitbucket.OriginPullRequestDiscoveryTrait>
            <com.cloudbees.jenkins.plugins.bitbucket.ForkPullRequestDiscoveryTrait>
              <strategyId>1</strategyId>
              <trust class="com.cloudbees.jenkins.plugins.bitbucket.ForkPullRequestDiscoveryTrait$TrustTeamForks" />
            </com.cloudbees.jenkins.plugins.bitbucket.ForkPullRequestDiscoveryTrait>
            <jenkins.scm.impl.trait.WildcardSCMHeadFilterTrait plugin="scm-api@2.2.6">
              <includes>master release* PR-*</includes>
              <excludes />
            </jenkins.scm.impl.trait.WildcardSCMHeadFilterTrait>
            <org.jenkinsci.plugins.scm__filter.BitbucketCommitSkipTrait plugin="bitbucket-scm-trait-commit-skip@0.1.1"/>
            <com.cloudbees.jenkins.plugins.bitbucket.WebhookRegistrationTrait>
              <mode>ITEM</mode>
            </com.cloudbees.jenkins.plugins.bitbucket.WebhookRegistrationTrait>
          </traits>
        </source>
        <strategy class="jenkins.branch.DefaultBranchPropertyStrategy">
          <properties class="empty-list" />
        </strategy>
      </jenkins.branch.BranchSource>
    </data>
    <owner class="org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject" reference="../.." />
  </sources>
  <factory class="org.jenkinsci.plugins.workflow.multibranch.WorkflowBranchProjectFactory">
    <owner class="org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject" reference="../.." />
    <scriptPath>Jenkinsfile</scriptPath>
  </factory>
</org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject>`,
                            {
                                headers: {
                                    "Content-Type": "application/xml",
                                    "Authorization": `Bearer ${token.output}`,
                                },
                            })
                            .then(success, error => {
                                if (error.response.status === 400) {
                                    logger.warn(`Multibranch job for [${applicationCreatedEvent.application.name}] probably already created`);
                                    return SuccessPromise;
                                } else {
                                    return failure(error);
                                }
                            });
                    });
            })
            .then(() => {
                const appBuildName = `${_.kebabCase(applicationCreatedEvent.project.name).toLowerCase()}-${_.kebabCase(applicationCreatedEvent.application.name).toLowerCase()}`;
                return OCCommon.createFromData({
                    apiVersion: "v1",
                    kind: "ImageStream",
                    metadata: {
                        name: appBuildName,
                    },
                }, [
                    new SimpleOption("-namespace", teamDevOpsProjectId),
                ])
                    .then(() => {

                        // TODO get the remote Url for the repo by using the Bitbucket API
                        // using the project and repo name or just the URL?
                        // https://docs.atlassian.com/bitbucket-server/rest/5.7.0/bitbucket-rest.html#idm45568365941504
                        // list all repos for a project and then look for a matching repo URL matching
                        // and then use the clone links...
                        const caFile = path.resolve(__dirname, "/Users/donovan/dev/absa/core/bitbucket-server/ca-chain.cert.pem");
                        const bitbucketAxios = axios.create({
                            httpsAgent: new https.Agent({
                                rejectUnauthorized: true,
                                ca: fs.readFileSync(caFile),
                            }),
                        });

                        return bitbucketAxios.get(`https://bitbucket.core.local/rest/api/1.0/projects/${applicationCreatedEvent.bitbucketProject.key}/repos`,
                            {
                                auth: {
                                    username: "donovan",
                                    password: "donovan",
                                },
                            })
                            .then(repos => {

                                logger.info(`Got Bitbucket repos in project: ${JSON.stringify(repos.data)}`);
                                const repo = repos.data.values.find(existingRepo => {
                                    // _.find(repo.links.clone, clone => {
                                    //     return (clone as any).href === applicationCreatedEvent.bitbucketRepository.repoUrl;
                                    // })
                                    return existingRepo.name === applicationCreatedEvent.bitbucketRepository.name;
                                });
                                const remoteUrl = _.find(repo.links.clone, clone => {
                                    return (clone as any).name === "ssh";
                                }) as any;

                                logger.info(`Using Git URI: ${remoteUrl.href}`);
                                // TODO this should be extracted to a configurable Template
                                // We could use a Template like the Jenkins and app templates
                                return OCCommon.createFromData({
                                        apiVersion: "v1",
                                        kind: "BuildConfig",
                                        metadata: {
                                            name: appBuildName,
                                        },
                                        spec: {
                                            source: {
                                                type: "Git",
                                                git: {
                                                    // temporary hack because of the NodePort
                                                    // TODO remove this!
                                                    uri: `${remoteUrl.href.replace("7999", "30999")}`,
                                                    ref: "master",
                                                },
                                                sourceSecret: {
                                                    // TODO should this be configurable?
                                                    name: "bitbucket-ssh",
                                                },
                                            },
                                            strategy: {
                                                sourceStrategy: {
                                                    from: {
                                                        kind: "ImageStreamTag",
                                                        name: "jdk8-maven3-newrelic-subatomic:2.0",
                                                    },
                                                },
                                            },
                                            output: {
                                                to: {
                                                    kind: "ImageStreamTag",
                                                    name: `${appBuildName}:latest`,
                                                },
                                            },
                                        },
                                    },
                                    [
                                        new SimpleOption("-namespace", teamDevOpsProjectId),
                                    ], true); // TODO clean up this hack - cannot be a boolean (magic)
                            });
                    })
                    .then(() => {
                        return Promise.all([["dev"],
                            ["sit"],
                            ["uat"]]
                            .map(environment => {
                                const projectId = `${_.kebabCase(applicationCreatedEvent.project.name).toLowerCase()}-${environment}`;
                                const appName = `${_.kebabCase(applicationCreatedEvent.application.name).toLowerCase()}`;
                                logger.info(`Processing app [${appName}] Template for: ${projectId}`);

                                return OCCommon.commonCommand("get", "templates",
                                    ["subatomic-app-template"],
                                    [
                                        new SimpleOption("-namespace", "openshift"),
                                        new SimpleOption("-output", "json"),
                                    ],
                                )
                                    .then(template => {
                                        const appTemplate: any = JSON.parse(template.output);
                                        appTemplate.metadata.namespace = projectId;
                                        return OCCommon.createFromData(appTemplate,
                                            [
                                                new SimpleOption("-namespace", projectId),
                                            ]
                                            , );
                                    })
                                    .then(() => {
                                        return OCCommon.commonCommand("process",
                                            "subatomic-app-template",
                                            [],
                                            [
                                                new SimpleOption("p", `APP_NAME=${appName}`),
                                                new SimpleOption("p", `IMAGE_STREAM_PROJECT=${projectId}`),
                                                new SimpleOption("-namespace", projectId),
                                            ],
                                        )
                                            .then(appTemplate => {
                                                logger.debug(`Processed app [${appName}] Template: ${appTemplate.output}`);

                                                return OCCommon.commonCommand("get", `dc/${appName}`, [],
                                                    [
                                                        new SimpleOption("-namespace", projectId),
                                                    ])
                                                    .then(() => {
                                                        logger.warn(`App [${appName}] Template has already been processed, deployment exists`);
                                                        return SuccessPromise;
                                                    }, () => {
                                                        return OCCommon.createFromData(JSON.parse(appTemplate.output),
                                                            [
                                                                new SimpleOption("-namespace", projectId),
                                                            ]);
                                                    });
                                            });
                                    });
                            }));
                    });

            })
            .then(() => {
                return ctx.messageClient.addressChannels({
                    text: "Your application has been successfully provisioned " +
                    "and is ready to build and deploy to your project environments via the Jenkins CI/CD pipeline",
                }, applicationCreatedEvent.teams.map(team =>
                    team.slackIdentity.teamChannel));
            });
    }
}
