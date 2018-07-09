import {logger} from "@atomist/automation-client";
import {QMConfig} from "../../../config/QMConfig";
import {OCCommandResult} from "../../../openshift/base/OCCommandResult";
import {AbstractOption} from "../../../openshift/base/options/AbstractOption";
import {NamedSimpleOption} from "../../../openshift/base/options/NamedSimpleOption";
import {SimpleOption} from "../../../openshift/base/options/SimpleOption";
import {StandardOption} from "../../../openshift/base/options/StandardOption";
import {OCClient} from "../../../openshift/OCClient";
import {OCCommon} from "../../../openshift/OCCommon";
import {getProjectDisplayName} from "../project/Project";

export class OCService {

    public async login() {
        return await OCClient.login(QMConfig.subatomic.openshift.masterUrl, QMConfig.subatomic.openshift.auth.token);
    }

    public async newDevOpsProject(openshiftProjectId: string, teamName: string): Promise<OCCommandResult> {
        return await OCClient.newProject(openshiftProjectId,
            `${teamName} DevOps`,
            `DevOps environment for ${teamName} [managed by Subatomic]`);
    }

    public async newSubatomicProject(openshiftProjectId: string, projectName: string, owningTenant: string, environment: string[]): Promise<OCCommandResult> {
        return await OCClient.newProject(openshiftProjectId,
            getProjectDisplayName(owningTenant, projectName, environment[0]),
            `${environment[1]} environment for ${projectName} [managed by Subatomic]`);
    }

    public async createDevOpsDefaultResourceQuota(openshiftProjectId: string): Promise<OCCommandResult> {
        return await OCCommon.createFromData({
            apiVersion: "v1",
            kind: "ResourceQuota",
            metadata: {
                name: "default-quota",
            },
            spec: {
                hard: {
                    "limits.cpu": "16", // 4 * 4m
                    "limits.memory": "4096Mi", // 4 * 1024Mi
                    "pods": "4",
                },
            },
        }, [
            new SimpleOption("-namespace", openshiftProjectId),
        ]);
    }

    public async createDevOpsDefaultLimits(openshiftProjectId: string): Promise<OCCommandResult> {
        return await OCCommon.createFromData({
            apiVersion: "v1",
            kind: "LimitRange",
            metadata: {
                name: "default-limits",
            },
            spec: {
                limits: [{
                    type: "Container",
                    max: {
                        cpu: "4",
                        memory: "1024Mi",
                    },
                    default: {
                        cpu: "4",
                        memory: "1024Mi",
                    },
                    defaultRequest: {
                        cpu: "0",
                        memory: "0Mi",
                    },
                }],
            },
        }, [
            new SimpleOption("-namespace", openshiftProjectId),
        ]);
    }

    public async createProjectDefaultResourceQuota(openshiftProjectId: string): Promise<OCCommandResult> {
        return await OCCommon.createFromData({
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
            new SimpleOption("-namespace", openshiftProjectId),
        ]);
    }

    public async createProjectDefaultLimits(openshiftProjectId: string): Promise<OCCommandResult> {
        return await OCCommon.createFromData({
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
                        memory: "1024Mi",
                    },
                    defaultRequest: {
                        cpu: "0",
                        memory: "0Mi",
                    },
                }],
            },
        }, [
            new SimpleOption("-namespace", openshiftProjectId),
        ]);
    }

    public async getSubatomicTemplate(templateName: string): Promise<OCCommandResult> {
        return await OCCommon.commonCommand("get", "templates",
            [templateName],
            [
                new SimpleOption("-namespace", "subatomic"),
                new SimpleOption("-output", "json"),
            ],
        );
    }

    public async getSubatomicAppTemplates(namespace = "subatomic"): Promise<OCCommandResult> {
        return await OCCommon.commonCommand("get", "templates",
            [],
            [
                new SimpleOption("l", "usage=subatomic-app"),
                new SimpleOption("-namespace", namespace),
                new SimpleOption("-output", "json"),
            ],
        );
    }

    public async getJenkinsTemplate(): Promise<OCCommandResult> {
        return await OCCommon.commonCommand("get", "templates",
            ["jenkins-persistent-subatomic"],
            [
                new SimpleOption("-namespace", "subatomic"),
                new SimpleOption("-output", "json"),
            ],
        );
    }

    public async getSubatomicImageStreamTags(namespace = "subatomic") {
        return OCCommon.commonCommand("get", "istag",
            [],
            [
                new SimpleOption("l", "usage=subatomic-is"),
                new SimpleOption("-namespace", namespace),
                new SimpleOption("-output", "json"),
            ],
        );
    }

    public async createResourceFromDataInNamespace(resourceDefinition: any, projectNamespace: string, applyNotReplace: boolean = false): Promise<OCCommandResult> {
        return await OCCommon.createFromData(resourceDefinition,
            [
                new SimpleOption("-namespace", projectNamespace),
            ]
            , applyNotReplace);
    }

    public async tagSubatomicImageToNamespace(imageStreamTagName: string, destinationProjectNamespace: string, destinationImageStreamTagName: string = imageStreamTagName): Promise<OCCommandResult> {
        return await OCCommon.commonCommand("tag",
            `subatomic/${imageStreamTagName}`,
            [`${destinationProjectNamespace}/${destinationImageStreamTagName}`]);
    }

    public async processJenkinsTemplateForDevOpsProject(devopsNamespace: string): Promise<OCCommandResult> {
        const parameters = [
            `NAMESPACE=${devopsNamespace}`,
            "JENKINS_IMAGE_STREAM_TAG=jenkins-subatomic:2.0",
            "BITBUCKET_NAME=Subatomic Bitbucket",
            `BITBUCKET_URL=${QMConfig.subatomic.bitbucket.baseUrl}`,
            `BITBUCKET_CREDENTIALS_ID=${devopsNamespace}-bitbucket`,
            // TODO this should be a property on Team. I.e. teamEmail
            "JENKINS_ADMIN_EMAIL=subatomic@local",
            // TODO the registry Cluster IP we will have to get by introspecting the registry Service
            // If no team email then the address of the createdBy member
            `MAVEN_SLAVE_IMAGE=${QMConfig.subatomic.openshift.dockerRepoUrl}/${devopsNamespace}/jenkins-slave-maven-subatomic:2.0`,
            `NODEJS_SLAVE_IMAGE=${QMConfig.subatomic.openshift.dockerRepoUrl}/${devopsNamespace}/jenkins-slave-nodejs-subatomic:2.0`,
        ];
        return await this.processOpenshiftTemplate("jenkins-persistent-subatomic", devopsNamespace, parameters);
    }

    public async processOpenshiftTemplate(templateName: string, namespace: string, parameters: string[], ignoreUnknownParameters: boolean = false) {
        const commandOptions: AbstractOption[] = [];
        if (ignoreUnknownParameters) {
            commandOptions.push(new StandardOption("ignore-unknown-parameters", "true"));
        }

        for (const parameter of parameters) {
            commandOptions.push(new SimpleOption("p", parameter));
        }

        commandOptions.push(new SimpleOption("-namespace", namespace));

        return await OCCommon.commonCommand("process",
            templateName,
            [],
            commandOptions,
        );
    }

    public async getDeploymentConfigInNamespace(dcName: string, namespace: string): Promise<OCCommandResult> {
        return await OCCommon.commonCommand("get", `dc/${dcName}`, [],
            [
                new SimpleOption("-namespace", namespace),
            ]);
    }

    public async rolloutDeploymentConfigInNamespace(dcName: string, namespace: string): Promise<OCCommandResult> {
        return await OCCommon.commonCommand(
            "rollout status",
            `dc/${dcName}`,
            [],
            [
                new SimpleOption("-namespace", namespace),
                new SimpleOption("-watch=false"),
            ], true);
    }

    public async getServiceAccountToken(serviceAccountName: string, namespace: string): Promise<OCCommandResult> {
        return await OCCommon.commonCommand("serviceaccounts",
            "get-token",
            [
                serviceAccountName,
            ], [
                new SimpleOption("-namespace", namespace),
            ]);
    }

    public async annotateJenkinsRoute(namespace: string): Promise<OCCommandResult> {
        return await OCCommon.commonCommand("annotate route",
            "jenkins",
            [],
            [
                new SimpleOption("-overwrite", "haproxy.router.openshift.io/timeout=120s"),
                new SimpleOption("-namespace", namespace),
            ]);
    }

    public async getJenkinsHost(namespace: string): Promise<OCCommandResult> {
        return await OCCommon.commonCommand(
            "get",
            "route/jenkins",
            [],
            [
                new SimpleOption("-output", "jsonpath={.spec.host}"),
                new SimpleOption("-namespace", namespace),
            ]);
    }

    public async getSecretFromNamespace(secretName: string, namespace: string): Promise<OCCommandResult> {
        return await OCCommon.commonCommand("get secrets",
            secretName,
            [],
            [
                new SimpleOption("-namespace", namespace),
            ]);
    }

    public async createBitbucketSSHAuthSecret(secretName: string, namespace: string): Promise<OCCommandResult> {
        return await OCCommon.commonCommand("secrets new-sshauth",
            secretName,
            [],
            [
                new SimpleOption("-ssh-privatekey", QMConfig.subatomic.bitbucket.cicdPrivateKeyPath),
                new SimpleOption("-ca-cert", QMConfig.subatomic.bitbucket.caPath),
                new SimpleOption("-namespace", namespace),
            ]);
    }

    public async createConfigServerSecret(namespace: string): Promise<OCCommandResult> {
        return await OCCommon.commonCommand("create secret generic",
            "subatomic-config-server",
            [],
            [
                new NamedSimpleOption("-from-literal=spring.cloud.config.server.git.hostKey", QMConfig.subatomic.bitbucket.cicdKey),
                new NamedSimpleOption("-from-file=spring.cloud.config.server.git.privateKey", QMConfig.subatomic.bitbucket.cicdPrivateKeyPath),
                new SimpleOption("-namespace", namespace),
            ]);
    }

    public async addTeamMembershipPermissionsToProject(projectId: string, team: { owners: Array<{ domainUsername }>, members: Array<{ domainUsername }> }) {
        await team.owners.map(async owner => {
            const ownerUsername = /[^\\]*$/.exec(owner.domainUsername)[0];
            logger.info(`Adding role to project [${projectId}] and owner [${owner.domainUsername}]: ${ownerUsername}`);
            return await OCClient.policy.addRoleToUser(ownerUsername,
                "admin",
                projectId);
        });
        await team.members.map(async member => {
            const memberUsername = /[^\\]*$/.exec(member.domainUsername)[0];
            await logger.info(`Adding role to project [${projectId}] and member [${member.domainUsername}]: ${memberUsername}`);
            return await OCClient.policy.addRoleToUser(memberUsername,
                "view",
                projectId);
        });
    }

    public async createPodNetwork(projectsToJoin: string[], projectToJoinTo: string): Promise<OCCommandResult> {
        return await OCCommon.commonCommand(
            "adm pod-network",
            "join-projects",
            projectsToJoin,
            [
                new StandardOption("to", `${projectToJoinTo}`),
            ]);
    }

    public async addRoleToUserInNamespace(user: string, role: string, namespace: string): Promise<OCCommandResult> {
        return await OCClient.policy.addRoleToUser(user,
            role,
            namespace);
    }

    public async createPVC(pvcName: string, namespace: string): Promise<OCCommandResult> {
        return await OCClient.createPvc(pvcName, namespace);
    }
}
