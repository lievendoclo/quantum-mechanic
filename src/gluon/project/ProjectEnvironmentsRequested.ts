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
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import * as _ from "lodash";
import * as qs from "query-string";
import {QMConfig} from "../../config/QMConfig";
import {SimpleOption} from "../../openshift/base/options/SimpleOption";
import {OCClient} from "../../openshift/OCClient";
import {OCCommon} from "../../openshift/OCCommon";
import {jenkinsAxios} from "../jenkins/Jenkins";
import {LinkExistingApplication} from "../packages/CreateApplication";
import {LinkExistingLibrary} from "../packages/CreateLibrary";

@EventHandler("Receive ProjectEnvironmentsRequestedEvent events", `
subscription ProjectEnvironmentsRequestedEvent {
  ProjectEnvironmentsRequestedEvent {
    id
    project {
      projectId
      name
      description
    }
    teams {
      teamId
      name
      slackIdentity {
        teamChannel
      }
      owners {
        firstName
        domainUsername
        slackIdentity {
          screenName
        }
      }
      members {
        firstName
        domainUsername
        slackIdentity {
          screenName
        }
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
export class ProjectEnvironmentsRequested implements HandleEvent<any> {

    public handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested ProjectEnvironmentsRequestedEvent event: ${JSON.stringify(event.data)}`);

        const environmentsRequestedEvent = event.data.ProjectEnvironmentsRequestedEvent[0];

        // TODO these environments should come from the event
        // Eventually a team should be able to decide what environments they need
        // and could add environments willy nilly
        return Promise.all([["dev", "Development"],
            ["sit", "Integration testing"],
            ["uat", "User acceptance"]]
            .map(environment => {
                const projectId = `${_.kebabCase(environmentsRequestedEvent.project.name).toLowerCase()}-${environment[0]}`;
                logger.info(`Working with OpenShift project Id: ${projectId}`);

                return OCClient.login(QMConfig.subatomic.openshift.masterUrl, QMConfig.subatomic.openshift.auth.token)
                    .then(() => {
                        return OCClient.newProject(projectId,
                            `${environmentsRequestedEvent.project.name} ${environment[0].toUpperCase()}`,
                            `${environment[1]} environment for ${environmentsRequestedEvent.project.name} [managed by Subatomic]`);
                    })
                    .then(() => {
                        // 2. Add permissions to projects based on owners (admin) and members (edit) - future will use roles
                        return this.addMembershipPermissions(projectId,
                            environmentsRequestedEvent.teams);
                    }, err => {
                        logger.warn(err);
                        // TODO what do we do with existing projects?
                        // We should probably make sure the name, display name etc. is consistent

                        return this.addMembershipPermissions(projectId,
                            environmentsRequestedEvent.teams);
                    })
                    .then(() => {
                        // 3. Ensure quotas are set per project
                        return OCCommon.createFromData({
                            apiVersion: "v1",
                            kind: "ResourceQuota",
                            metadata: {
                                name: "default-quota",
                            },
                            spec: {
                                hard: {
                                    "limits.cpu": "80", // 20 * 4m
                                    "limits.memory": "20480Mi", // 20 * 1024Mi
                                    "pods": "20",
                                    "replicationcontrollers": "20",
                                    "services": "20",
                                },
                            },
                        }, [
                            new SimpleOption("-namespace", projectId),
                        ])
                            .then(() => {
                                return OCCommon.createFromData({
                                    apiVersion: "v1",
                                    kind: "LimitRange",
                                    metadata: {
                                        name: "default-limits",
                                    },
                                    spec: {
                                        limits: [{
                                            type: "Container",
                                            max: {
                                                cpu: "8",
                                                memory: "4096Mi",
                                            },
                                            default: {
                                                cpu: "4",
                                                memory: "512Mi",
                                            },
                                            defaultRequest: {
                                                cpu: "0",
                                                memory: "0Mi",
                                            },
                                        }],
                                    },
                                }, [
                                    new SimpleOption("-namespace", projectId),
                                ]);
                            });
                    })
                    .then(() => {
                        // TODO filter for the valid app templates by using a selector on the openshif project
                        // I.e. get all templates that have a label of subatomic.bison.co.za/app-template: xxx
                        // then iterate over them and copy them into the project
                        return OCCommon.commonCommand("get", "templates",
                            ["subatomic-app-template"],
                            [
                                new SimpleOption("-namespace", "subatomic"),
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
                            });
                    })
                    .then(() => {
                        const teamDevOpsProjectId = `${_.kebabCase(environmentsRequestedEvent.teams[0].name).toLowerCase()}-devops`;
                        return OCCommon.commonCommand(
                            "policy add-role-to-user",
                            "edit",
                            [
                                `system:serviceaccount:${teamDevOpsProjectId}:jenkins`,
                            ], [
                                new SimpleOption("-namespace", projectId),
                            ]);
                    });
            }))
            .then(() => {
                // TODO a project should have an owning team
                // this is the Jenkins instance that should be used for the project folder etc.
                const teamDevOpsProjectId = `${_.kebabCase(environmentsRequestedEvent.teams[0].name).toLowerCase()}-devops`;
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

                                const axios = jenkinsAxios();
                                return axios.post(`https://${jenkinsHost.output}/createItem?name=${_.kebabCase(environmentsRequestedEvent.project.name).toLowerCase()}`,
                                    `
<com.cloudbees.hudson.plugins.folder.Folder plugin="cloudbees-folder@6.0.4">
  <description>Folder for ${environmentsRequestedEvent.project.name} project [[managed by Subatomic](${QMConfig.subatomic.docs.baseUrl}/projects/${environmentsRequestedEvent.project.name})]</description>
  <displayName>${environmentsRequestedEvent.project.name}</displayName>
  <properties>
    <com.cloudbees.hudson.plugins.folder.properties.FolderCredentialsProvider_-FolderCredentialsProperty>
      <domainCredentialsMap class="hudson.util.CopyOnWriteMap$Hash">
        <entry>
          <com.cloudbees.plugins.credentials.domains.Domain plugin="credentials@2.1.16">
            <specifications />
          </com.cloudbees.plugins.credentials.domains.Domain>
          <java.util.concurrent.CopyOnWriteArrayList />
        </entry>
        <entry>
          <com.cloudbees.plugins.credentials.domains.Domain plugin="credentials@2.1.16">
            <name>${environmentsRequestedEvent.project.name} Credentials</name>
            <name>${environmentsRequestedEvent.project.name} Credentials</name>
            <description>The secrets which contain the deployment environments for use in the multibranch jobs for this project</description>
            <specifications />
          </com.cloudbees.plugins.credentials.domains.Domain>
          <list>
            <org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl plugin="plain-credentials@1.4">
              <id>devops-project</id>
              <description>Team DevOps OpenShift project Id</description>
              <secret>${teamDevOpsProjectId}</secret>
            </org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl>
            <org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl plugin="plain-credentials@1.4">
              <id>dev-project</id>
              <description>DEV OpenShift project Id</description>
              <secret>${_.kebabCase(environmentsRequestedEvent.project.name).toLowerCase()}-dev</secret>
            </org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl>
            <org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl plugin="plain-credentials@1.4">
              <id>sit-project</id>
              <description>SIT OpenShift project Id</description>
              <secret>${_.kebabCase(environmentsRequestedEvent.project.name).toLowerCase()}-sit</secret>
            </org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl>
            <org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl plugin="plain-credentials@1.4">
              <id>uat-project</id>
              <description>UAT OpenShift project Id</description>
              <secret>${_.kebabCase(environmentsRequestedEvent.project.name).toLowerCase()}-uat</secret>
            </org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl>
          </list>
        </entry>
      </domainCredentialsMap>
    </com.cloudbees.hudson.plugins.folder.properties.FolderCredentialsProvider_-FolderCredentialsProperty>
  </properties>
</com.cloudbees.hudson.plugins.folder.Folder>`,
                                    {
                                        headers: {
                                            "Content-Type": "application/xml",
                                            "Authorization": `Bearer ${token.output}`,
                                        },
                                    })
                                    .then(success, error => {
                                        if (error.response && error.response.status === 400) {
                                            logger.warn(`Folder for [${environmentsRequestedEvent.project.name}] probably already created`);
                                            return SuccessPromise;
                                        } else {
                                            return failure(error);
                                        }
                                    });
                            });
                    });
            })
            .then(() => {
                const teamDevOpsProjectId = `${_.kebabCase(environmentsRequestedEvent.teams[0].name).toLowerCase()}-devops`;
                return OCCommon.commonCommand("serviceaccounts",
                    "get-token",
                    [
                        "subatomic-jenkins",
                    ], [
                        new SimpleOption("-namespace", teamDevOpsProjectId),
                    ]);
            })
            .then(token => {
                const teamDevOpsProjectId = `${_.kebabCase(environmentsRequestedEvent.teams[0].name).toLowerCase()}-devops`;
                return OCCommon.commonCommand(
                    "get",
                    "route/jenkins",
                    [],
                    [
                        new SimpleOption("-output", "jsonpath={.spec.host}"),
                        new SimpleOption("-namespace", teamDevOpsProjectId),
                    ])
                    .then(jenkinsHost => {
                        const jenkinsCredentials = {
                            "": "0",
                            "credentials": {
                                scope: "GLOBAL",
                                id: `${teamDevOpsProjectId}-bitbucket`,
                                username: QMConfig.subatomic.bitbucket.auth.username,
                                password: QMConfig.subatomic.bitbucket.auth.password,
                                description: `${teamDevOpsProjectId}-bitbucket`,
                                $class: "com.cloudbees.plugins.credentials.impl.UsernamePasswordCredentialsImpl",
                            },
                        };

                        const axios = jenkinsAxios();
                        axios.interceptors.request.use(request => {
                            if (request.data && (request.headers["Content-Type"].indexOf("application/x-www-form-urlencoded") !== -1)) {
                                logger.debug(`Stringifying URL encoded data: ${qs.stringify(request.data)}`);
                                request.data = qs.stringify(request.data);
                            }
                            return request;
                        });

                        return axios.post(`https://${jenkinsHost.output}/credentials/store/system/domain/_/createCredentials`,
                            {
                                json: `${JSON.stringify(jenkinsCredentials)}`,
                            },
                            {
                                headers: {
                                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                                    "Authorization": `Bearer ${token.output}`,
                                },
                            });
                    });
            })
            .then(() => {

                const msg: SlackMessage = {
                    text: `
Since you have Subatomic project environments ready, you can now add packages.
A package is either an application or a library, click the button below to create an application now.`,
                    attachments: [{
                        fallback: "Create or link existing package",
                        footer: `For more information, please read the ${this.docs()}`, // TODO use actual icon
                        color: "#45B254",
                        actions: [
                            // TODO see https://github.com/absa-subatomic/quantum-mechanic/issues/9
                            // buttonForCommand(
                            //     {text: "Create application"},
                            //     new CreateApplication(),
                            //     {}),
                            buttonForCommand(
                                {text: "Link existing application"},
                                new LinkExistingApplication(),
                                {
                                    projectName: environmentsRequestedEvent.project.name,
                                }),
                            // buttonForCommand(
                            //     {text: "Create shared library"},
                            //     this,
                            //     {}),
                            buttonForCommand(
                                {text: "Link existing library"},
                                new LinkExistingLibrary(),
                                {
                                    projectName: environmentsRequestedEvent.project.name,
                                }),
                        ],
                    }],
                };

                return ctx.messageClient.addressChannels(msg,
                    environmentsRequestedEvent.teams.map(team =>
                        team.slackIdentity.teamChannel));
            })
            .catch(err => {
                return failure(err);
            });
    }

    private addMembershipPermissions(projectId: string, teams: any[]): Array<Promise<any[]>> {
        return teams.map(team => {
            return Promise.all(
                team.owners.map(owner => {
                    const ownerUsername = /[^\\]*$/.exec(owner.domainUsername)[0];
                    logger.info(`Adding role to project [${projectId}] and owner [${owner.domainUsername}]: ${ownerUsername}`);
                    return OCClient.policy.addRoleToUser(ownerUsername,
                        "admin",
                        projectId);
                }))
                .then(() => {
                    return Promise.all(
                        team.members.map(member => {
                            const memberUsername = /[^\\]*$/.exec(member.domainUsername)[0];
                            logger.info(`Adding role to project [${projectId}] and member [${member.domainUsername}]: ${memberUsername}`);
                            return OCClient.policy.addRoleToUser(memberUsername,
                                "view",
                                projectId);
                        }));
                });
        });
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/projects`,
            "documentation")}`;
    }
}
