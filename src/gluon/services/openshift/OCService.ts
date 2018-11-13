import {logger} from "@atomist/automation-client";
import * as fs from "fs";
import _ = require("lodash");
import {inspect} from "util";
import {OpenShiftConfig} from "../../../config/OpenShiftConfig";
import {QMConfig} from "../../../config/QMConfig";
import {userFromDomainUser} from "../../../gluon/util/member/Members";
import {isSuccessCode} from "../../../http/Http";
import {OpenshiftApiResult} from "../../../openshift/api/base/OpenshiftApiResult";
import {OpenShiftApi} from "../../../openshift/api/OpenShiftApi";
import {OpenshiftResource} from "../../../openshift/api/resources/OpenshiftResource";
import {ResourceFactory} from "../../../openshift/api/resources/ResourceFactory";
import {OCCommandResult} from "../../../openshift/base/OCCommandResult";
import {AbstractOption} from "../../../openshift/base/options/AbstractOption";
import {NamedSimpleOption} from "../../../openshift/base/options/NamedSimpleOption";
import {SimpleOption} from "../../../openshift/base/options/SimpleOption";
import {StandardOption} from "../../../openshift/base/options/StandardOption";
import {OCClient} from "../../../openshift/OCClient";
import {OCCommon} from "../../../openshift/OCCommon";
import {OpaqueSecret} from "../../util/openshift/OpaqueSecret";
import {getProjectDisplayName} from "../../util/project/Project";
import {BaseProjectTemplateLoader} from "../../util/resources/BaseProjectTemplateLoader";
import {QuotaLoader} from "../../util/resources/QuotaLoader";
import {QMError, QMErrorType} from "../../util/shared/Error";
import {retryFunction} from "../../util/shared/RetryFunction";
import {QMTeam} from "../../util/team/Teams";
import {OCImageService} from "./OCImageService";

export class OCService {
    get loggedIn(): boolean {
        return this.isLoggedIn;
    }

    set loggedIn(value: boolean) {
        this.isLoggedIn = value;
    }

    get openShiftApi(): OpenShiftApi {
        if (this.openShiftApiInstance === undefined) {
            logger.error(`Failed to access the openShiftApiInstance. Make sure the you have performed an OCService.login command`);
            throw new QMError("OpenShift login failure!");
        }
        return this.openShiftApiInstance;
    }

    set openShiftApi(value: OpenShiftApi) {
        this.openShiftApiInstance = value;
    }

    private openShiftApiInstance: OpenShiftApi;

    private isLoggedIn: boolean;

    private quotaLoader: QuotaLoader = new QuotaLoader();
    private baseProjectTemplateLoader: BaseProjectTemplateLoader = new BaseProjectTemplateLoader();

    constructor(private ocImageService = new OCImageService()) {
    }

    public async login(openshiftDetails: OpenShiftConfig = QMConfig.subatomic.openshiftNonProd, softLogin = false) {
        this.openShiftApi = new OpenShiftApi(openshiftDetails);
        this.ocImageService.openShiftApi = this.openShiftApi;
        this.loggedIn = true;
        if (!softLogin) {
            return await OCClient.login(openshiftDetails.masterUrl, openshiftDetails.auth.token);
        }
    }

    public async newDevOpsProject(openshiftProjectId: string, teamName: string, rawResult = false): Promise<any> {
        logger.debug(`Trying to create new Dev Ops environment. openshiftProjectId: ${openshiftProjectId}; teamName: ${teamName} `);

        const createResult = await this.openShiftApi.newProject(openshiftProjectId,
            `${teamName} DevOps`,
            `DevOps environment for ${teamName} [managed by Subatomic]`);
        if (rawResult) {
            return createResult;
        } else if (!isSuccessCode(createResult.status)) {
            if (createResult.status === 409) {
                throw new QMError("DevOps project already exists.", undefined, QMErrorType.conflict);
            } else {
                logger.error(`Failed to create DevOps project: ${inspect(createResult)}`);
                throw new QMError("Failed to create the OpenShift DevOps project as requested");
            }
        }
        return createResult.data;
    }

    public async newSubatomicProject(openshiftProjectId: string, projectName: string, owningTenant: string, environment: string[], rawResult = false): Promise<any> {
        logger.debug(`Trying to create new Subatomic Project. openshiftProjectId: ${openshiftProjectId}; projectName: ${projectName}; environment: ${JSON.stringify(environment)} `);

        const createResult = await this.openShiftApi.newProject(openshiftProjectId,
            getProjectDisplayName(owningTenant, projectName, environment[0]),
            `${environment[1]} environment for ${projectName} [managed by Subatomic]`);
        if (rawResult) {
            return createResult;
        } else if (!isSuccessCode(createResult.status)) {
            if (createResult.status === 409) {
                throw new QMError("Requested project already exists.", undefined, QMErrorType.conflict);
            } else {
                logger.error(`Failed to create OpenShift project: ${inspect(createResult)}`);
                throw new QMError("Failed to create the OpenShift project as requested");
            }
        }
        return createResult.data;
    }

    public async createDevOpsDefaultResourceQuota(openshiftProjectId: string, replace = true, rawResult = false): Promise<any> {
        logger.debug(`Trying to create DevOps default resource quota. openshiftProjectId: ${openshiftProjectId}`);
        const createResult = await this.openShiftApi.create.create(
            this.quotaLoader.getDevOpsDefaultResourceQuota(),
            openshiftProjectId,
            replace,
        );

        if (rawResult) {
            return createResult;
        } else if (!isSuccessCode(createResult.status)) {
            logger.error(`Failed to create default quota in DevOps: ${inspect(createResult)}`);
            throw new QMError("Failed to create the OpenShift default Quota in DevOps as requested");
        }
        return createResult.data;
    }

    public async createDevOpsDefaultLimits(openshiftProjectId: string, apply = true, rawResult = false): Promise<any> {
        logger.debug(`Trying to create DevOps default limits. openshiftProjectId: ${openshiftProjectId}`);

        const createResult = await this.openShiftApi.create.create(
            this.quotaLoader.getDevOpsDefaultLimitRange(),
            openshiftProjectId,
            apply,
        );

        if (rawResult) {
            return createResult;
        } else if (!isSuccessCode(createResult.status)) {
            logger.error(`Failed to create default limits in DevOps: ${inspect(createResult)}`);
            throw new QMError("Failed to create the OpenShift default-limits in DevOps as requested");
        }
        return createResult.data;
    }

    public async createProjectDefaultResourceQuota(openshiftProjectId: string, apply = true, rawResult = false): Promise<any> {
        logger.debug(`Trying to create project default resource quota. openshiftProjectId: ${openshiftProjectId}`);

        const createResult = await this.openShiftApi.create.create(
            this.quotaLoader.getProjectDefaultResourceQuota(),
            openshiftProjectId,
            apply,
        );

        if (rawResult) {
            return createResult;
        } else if (!isSuccessCode(createResult.status)) {
            logger.error(`Failed to create default quota in project: ${inspect(createResult)}`);
            throw new QMError("Failed to create the OpenShift default Quota in project as requested");
        }
        return createResult.data;
    }

    public async createProjectDefaultLimits(openshiftProjectId: string, apply = true, rawResult = false): Promise<any> {
        logger.debug(`Trying to create project default limits. openshiftProjectId: ${openshiftProjectId}`);

        const createResult = await this.openShiftApi.create.create(
            this.quotaLoader.getProjectDefaultLimitRange(),
            openshiftProjectId,
            apply,
        );

        if (rawResult) {
            return createResult;
        } else if (!isSuccessCode(createResult.status)) {
            logger.error(`Failed to create default limits in project: ${inspect(createResult)}`);
            throw new QMError("Failed to create the OpenShift default-limits in project as requested");
        }
        return createResult.data;
    }

    public async getSubatomicTemplate(templateName: string, namespace: string = "subatomic"): Promise<OCCommandResult> {
        logger.debug(`Trying to get subatomic template. templateName: ${templateName}`);
        return await OCCommon.commonCommand("get", "templates",
            [templateName],
            [
                new SimpleOption("-namespace", namespace),
                new SimpleOption("-output", "json"),
            ],
        );
    }

    public async getSubatomicAppTemplates(namespace = "subatomic"): Promise<OpenshiftResource[]> {
        logger.debug(`Trying to get subatomic templates. namespace: ${namespace}`);
        const queryResult = await this.openShiftApi.get.getAllFromNamespace("Template", namespace, "v1");

        if (isSuccessCode(queryResult.status)) {
            const templates = [];
            for (const template of queryResult.data.items) {
                if (template.metadata.labels !== undefined) {
                    if (template.metadata.labels.usage === "subatomic-app") {
                        // These aren't set for some reason
                        template.kind = "Template";
                        template.apiVersion = "v1";
                        templates.push(template);
                    }
                }
            }
            return templates;
        } else {
            logger.error(`Failed to find Subatomic App Templates in Subatomic namespace: ${inspect(queryResult)}`);
            throw new QMError("Failed to find Subatomic App Templates in the Subatomic namespace");
        }
    }

    public async getJenkinsTemplate(): Promise<OCCommandResult> {
        logger.debug(`Trying to get jenkins template.`);
        return await OCCommon.commonCommand("get", "templates",
            ["jenkins-persistent-subatomic"],
            [
                new SimpleOption("-namespace", "subatomic"),
                new SimpleOption("-output", "json"),
            ],
        );
    }

    public async getSubatomicImageStreamTags(namespace: string = "subatomic") {
        return this.ocImageService.getSubatomicImageStreamTags(namespace);
    }

    public async applyResourceFromDataInNamespace(resourceDefinition: OpenshiftResource, projectNamespace: string, applyNotReplace: boolean = false): Promise<OpenshiftApiResult> {
        logger.debug(`Trying to create resource from data in namespace. projectNamespace: ${projectNamespace}`);

        let response: OpenshiftApiResult;
        if (applyNotReplace) {
            response = await this.openShiftApi.create.apply(resourceDefinition, projectNamespace);
        } else {
            response = await this.openShiftApi.create.replace(resourceDefinition, projectNamespace);
        }

        if (!isSuccessCode(response.status)) {
            logger.error(`Failed to create requested resource.\nResource: ${JSON.stringify(resourceDefinition)}`);
            if (!_.isEmpty(response.data.items)) {
                for (const item of response.data.items) {
                    if (!isSuccessCode(item.status)) {
                        logger.error(`Resource Failed: ${inspect(item.data)}`);
                    }
                }
            } else {
                logger.error(`Resource Failed: ${inspect(response)}`);
            }
            throw new QMError("Failed to create requested resource");
        }

        return response;
    }

    public async tagSubatomicImageToNamespace(imageStreamTagName: string, destinationProjectNamespace: string, destinationImageStreamTagName: string = imageStreamTagName): Promise<OpenshiftApiResult> {
        return await this.tagImageToNamespace("subatomic", imageStreamTagName, destinationProjectNamespace, destinationImageStreamTagName);
    }

    public async tagImageToNamespace(sourceNamespace: string, imageStreamTagName: string, destinationProjectNamespace: string, destinationImageStreamTagName: string = imageStreamTagName): Promise<OpenshiftApiResult> {

        let applyOrReplace = true;

        // check if exists if so then must replace not apply
        const existingImageStreamTagResult = await this.openShiftApi.get.get("ImageStreamTag", imageStreamTagName, destinationProjectNamespace);
        if (isSuccessCode(existingImageStreamTagResult.status)) {
            applyOrReplace = false;
        }

        const imageStreamTagResult = await this.openShiftApi.get.get("ImageStreamTag", imageStreamTagName, sourceNamespace);

        if (!isSuccessCode(imageStreamTagResult.status)) {
            throw new QMError(`Unable to find ImageStreamTag ${imageStreamTagName} in namespace ${sourceNamespace}`);
        }

        const imageStreamLabels = imageStreamTagResult.data.metadata.labels;

        const imageStreamTag = await this.ocImageService.modifyImageStreamTagToImportIntoNamespace(imageStreamTagResult.data, destinationProjectNamespace);

        imageStreamTag.metadata.name = destinationImageStreamTagName;

        await this.applyResourceFromDataInNamespace(imageStreamTag, destinationProjectNamespace, applyOrReplace);

        const labelPatch = this.createLabelPatch(destinationImageStreamTagName.split(":")[0], "ImageStream", "v1", imageStreamLabels);
        return await this.patchResourceInNamespace(labelPatch, destinationProjectNamespace, false);
    }

    public async tagAllSubatomicImageStreamsToDevOpsEnvironment(devopsProjectId) {
        const imageStreamTagsFromSubatomicNamespace = await this.ocImageService.getSubatomicImageStreamTags();

        const labelPatches = imageStreamTagsFromSubatomicNamespace.map(imageStreamTag => {
            return this.createLabelPatch(imageStreamTag.metadata.name.split(":")[0], "ImageStream", "v1", imageStreamTag.metadata.labels);
        });

        const imageStreamTags = await this.ocImageService.modifyImageStreamTagsToImportIntoNamespace(imageStreamTagsFromSubatomicNamespace, devopsProjectId);

        const resourceList = ResourceFactory.resourceList();
        resourceList.items.push(...imageStreamTags);

        await this.applyResourceFromDataInNamespace(resourceList, devopsProjectId, false);

        for (const labelPatch of labelPatches) {
            await this.patchResourceInNamespace(labelPatch, devopsProjectId, false);
        }
    }

    public async processJenkinsTemplateForDevOpsProject(devopsNamespace: string): Promise<OCCommandResult> {
        logger.debug(`Trying to process jenkins template for devops project template. devopsNamespace: ${devopsNamespace}`);
        const parameters = [
            `NAMESPACE=${devopsNamespace}`,
            "BITBUCKET_NAME=Subatomic Bitbucket",
            `BITBUCKET_URL=${QMConfig.subatomic.bitbucket.baseUrl}`,
            `BITBUCKET_CREDENTIALS_ID=${devopsNamespace}-bitbucket`,
            // TODO this should be a property on Team. I.e. teamEmail
            "JENKINS_ADMIN_EMAIL=subatomic@local",
            // TODO the registry Cluster IP we will have to get by introspecting the registry Service
            // If no team email then the address of the createdBy member
            `DEVOPS_URL=${QMConfig.subatomic.openshiftNonProd.dockerRepoUrl}/${devopsNamespace}`,
        ];
        return await this.processOpenshiftTemplate("jenkins-persistent-subatomic", devopsNamespace, parameters);
    }

    public async processOpenshiftTemplate(templateName: string, namespace: string, parameters: string[], ignoreUnknownParameters: boolean = false) {
        logger.debug(`Trying to process openshift template in namespace. templateName: ${templateName}; namespace: ${namespace}, paramaters: ${JSON.stringify(parameters)}`);
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
        logger.debug(`Trying to get dc in namespace. dcName: ${dcName}, namespace: ${namespace}`);
        return await OCCommon.commonCommand("get", `dc/${dcName}`, [],
            [
                new SimpleOption("-namespace", namespace),
            ]);
    }

    public async rolloutDeploymentConfigInNamespace(dcName: string, namespace: string): Promise<OCCommandResult> {
        logger.debug(`Trying to rollout dc in namespace. dcName: ${dcName}, namespace: ${namespace}`);
        return await OCCommon.commonCommand(
            "rollout status",
            `dc/${dcName}`,
            [],
            [
                new SimpleOption("-namespace", namespace),
                new SimpleOption("-watch=false"),
            ], true);
    }

    public async getServiceAccountToken(serviceAccountName: string, namespace: string): Promise<string> {
        logger.debug(`Trying to get service account token in namespace. serviceAccountName: ${serviceAccountName}, namespace: ${namespace}`);

        let tokenSecretName: string = "";
        await retryFunction(4, 5000, async (attemptNumber: number) => {
            logger.warn(`Trying to get service account token. Attempt number ${attemptNumber}.`);

            const serviceAccountResult = await this.openShiftApi.get.get("ServiceAccount", serviceAccountName, namespace);

            if (!isSuccessCode(serviceAccountResult.status)) {
                logger.error(`Failed to find service account ${serviceAccountName} in namespace ${namespace}. Error: ${inspect(serviceAccountResult)}`);
                throw new QMError(`Failed to find service account ${serviceAccountName} in namespace ${namespace}`);
            }

            if (!_.isEmpty(serviceAccountResult.data.secrets)) {
                logger.info(JSON.stringify(serviceAccountResult.data));
                for (const secret of serviceAccountResult.data.secrets) {
                    if (secret.name.startsWith(`${serviceAccountName}-token`)) {
                        tokenSecretName = secret.name;
                        return true;
                    }
                }
            }

            if (attemptNumber < 4) {
                logger.warn(`Waiting to retry again in ${5000}ms...`);
            }

            return false;
        });

        if (_.isEmpty(tokenSecretName)) {
            throw new QMError(`Failed to find token for ServiceAccount ${serviceAccountName}`);
        }

        const secretDetailsResult = await this.openShiftApi.get.get("Secret", tokenSecretName, namespace);

        if (!isSuccessCode(secretDetailsResult.status)) {
            logger.error(`Failed to find secret ${tokenSecretName}. Error: ${inspect(secretDetailsResult)}`);
            throw new QMError(`Failed to find secret containing the jenkins token. Please make sure it exists.`);
        }

        return Buffer.from(secretDetailsResult.data.data.token, "base64").toString("ascii");
    }

    public async annotateJenkinsRoute(namespace: string): Promise<OCCommandResult> {
        logger.debug(`Trying to annotate jenkins route in namespace. namespace: ${namespace}`);
        return await OCCommon.commonCommand("annotate route",
            "jenkins",
            [],
            [
                new SimpleOption("-overwrite", "haproxy.router.openshiftNonProd.io/timeout=120s"),
                new SimpleOption("-namespace", namespace),
            ]);
    }

    public async getJenkinsHost(namespace: string): Promise<OCCommandResult> {
        logger.debug(`Trying to get jenkins host in namespace. namespace: ${namespace}`);
        return await OCCommon.commonCommand(
            "get",
            "route/jenkins",
            [],
            [
                new SimpleOption("-output", "jsonpath={.spec.host}"),
                new SimpleOption("-namespace", namespace),
            ]);
    }

    public async getSecretFromNamespace(secretName: string, namespace: string): Promise<OpenshiftApiResult> {
        logger.debug(`Trying to get secret in namespace. secretName: ${secretName}, namespace: ${namespace}`);
        const secretResult = await this.openShiftApi.get.get("Secret", secretName, namespace);
        if (!isSuccessCode(secretResult.status)) {
            throw new QMError(`Failed to secret ${secretName} from namespace ${namespace}`);
        }
        return secretResult;
    }

    public async createBitbucketSSHAuthSecret(secretName: string, namespace: string, apply = true): Promise<OpenshiftApiResult> {
        logger.debug(`Trying to create bitbucket ssh auth secret in namespace. secretName: ${secretName}, namespace: ${namespace}`);

        const secret = new OpaqueSecret(secretName);
        secret.addFile("ssh-privatekey", QMConfig.subatomic.bitbucket.cicdPrivateKeyPath);
        secret.addFile("ca.crt", QMConfig.subatomic.bitbucket.caPath);

        const createSecretResult = await this.openShiftApi.create.create(secret, namespace, apply);
        if (!isSuccessCode(createSecretResult.status)) {
            logger.error(`Failed to create the secret ${secretName} in namespace ${namespace}: ${inspect(createSecretResult)}`);
            throw new QMError(`Failed to create secret ${secretName}.`);
        }
        return createSecretResult;
    }

    public async createConfigServerSecret(namespace: string): Promise<OCCommandResult> {
        logger.debug(`Trying to create config server secret. namespace: ${namespace}`);

        logger.debug("Extracting raw ssh key from cicd key");
        // Ignore the ssh-rsa encoding string, and any user name details at the end.
        const rawSSHKey = QMConfig.subatomic.bitbucket.cicdKey.split(" ")[1];

        return await OCCommon.commonCommand("create secret generic",
            "subatomic-config-server",
            [],
            [
                new NamedSimpleOption("-from-literal=spring.cloud.config.server.git.hostKey", rawSSHKey),
                new NamedSimpleOption("-from-file=spring.cloud.config.server.git.privateKey", QMConfig.subatomic.bitbucket.cicdPrivateKeyPath),
                new SimpleOption("-namespace", namespace),
            ]);
    }

    public async addTeamMembershipPermissionsToProject(projectId: string, team: QMTeam) {
        const teamOwners = team.owners.map( owner => userFromDomainUser(owner.domainUsername) );
        if (teamOwners.length > 0) {
            logger.debug(`Trying to add team membership permission to project for role admin.`);
            await this.openShiftApi.policy.addRoleToUsers(teamOwners, "admin", projectId);
        }

        const teamMembers = team.members.map( member => userFromDomainUser(member.domainUsername) );
        if (teamMembers.length > 0) {
            logger.debug(`Trying to add team membership permission to project for role edit.`);
            await this.openShiftApi.policy.addRoleToUsers(teamMembers, "edit", projectId);
        }
    }

    public async removeTeamMembershipPermissionsFromProject(projectId: string, domainUserName: string) {
        const memberUsername = userFromDomainUser(domainUserName);
        logger.info(`Removing role from project [${projectId}] and member [${domainUserName}]: ${memberUsername}`);
        return await this.openShiftApi.policy.removeRoleFromUser(memberUsername, "edit", projectId);
    }

    public async createPodNetwork(projectToJoin: string, projectToJoinTo: string): Promise<OpenshiftApiResult> {
        logger.debug(`Trying to create pod network. projectToJoin: ${projectToJoin}; projectToJoinTo: ${projectToJoinTo}`);

        return this.openShiftApi.adm.podNetworkJoinToProject(projectToJoin, projectToJoinTo);
    }

    public async addRoleToUserInNamespace(user: string, role: string, namespace: string): Promise<OpenshiftApiResult> {
        logger.debug(`Trying to add role to user in namespace: user: ${user}; role: ${role}; namespace: ${namespace}`);
        const addRoleResult = await this.openShiftApi.policy.addRoleToUsers([user], role, namespace);
        if (!isSuccessCode(addRoleResult.status)) {
            logger.error(`Failed to grant the role ${role} to account ${user}. Error: ${inspect(addRoleResult)}`);
            throw new QMError(`Failed to grant the role ${role} to account ${user}.`);
        }
        return addRoleResult;
    }

    public async createPVC(pvcName: string, namespace: string): Promise<OCCommandResult> {
        logger.debug(`Trying to create pvc in namespace. pvcName: ${pvcName}; namespace: ${namespace}`);
        return await OCClient.createPvc(pvcName, namespace);
    }

    public async initilizeProjectWithDefaultProjectTemplate(projectId: string, apply = true) {
        const template = this.baseProjectTemplateLoader.getTemplate();
        if (!_.isEmpty(template.objects)) {
            logger.info(`Applying base project template to ${projectId}`);
            const fileName = Date.now() + ".json";
            fs.writeFileSync(`/tmp/${fileName}`, JSON.stringify(template));
            // log client into non prod to process template - hacky! Need to fix.
            await OCClient.login(QMConfig.subatomic.openshiftNonProd.masterUrl, QMConfig.subatomic.openshiftNonProd.auth.token);
            const processedTemplateResult = await OCCommon.commonCommand("process", `-f /tmp/${fileName}`);
            const result = await this.applyResourceFromDataInNamespace(JSON.parse(processedTemplateResult.output), projectId, apply);
            if (!isSuccessCode(result.status)) {
                logger.error(`Template failed to create properly: ${inspect(result)}`);
                throw new QMError("Failed to create all items in base project template.");
            }
        } else {
            logger.debug(`Base template is empty. Not applying to project ${projectId}`);
        }
    }

    public async findProject(projectId: string) {
        const listOfProjectsResult = await OCCommon.commonCommand("get", "projects",
            [], [new SimpleOption("-output", "json")]);
        for (const project of JSON.parse(listOfProjectsResult.output).items) {
            if (project.metadata.name === projectId) {
                return project;
            }
        }
        return null;
    }

    public async exportAllResources(projectId: string) {
        const listOfResourcesResult = await OCCommon.commonCommand("export", "all",
            [], [new SimpleOption("-output", "json"), new SimpleOption("-namespace", projectId)]);
        return JSON.parse(listOfResourcesResult.output);
    }

    public async patchResourceInNamespace(resourcePatch: OpenshiftResource, namespace: string, deleteMetaData: boolean = true) {

        const response = await this.openShiftApi.patch.patch(resourcePatch, namespace, deleteMetaData);

        if (!isSuccessCode(response.status)) {
            logger.error(`Failed to patch requested resource.\nResource: ${JSON.stringify(resourcePatch)}`);
            if (!_.isEmpty(response.data.items)) {
                for (const item of response.data.items) {
                    if (!isSuccessCode(item.status)) {
                        logger.error(`Resource Failed: ${inspect(item.data)}`);
                    }
                }
            } else {
                logger.error(`Resource Failed: ${inspect(response)}`);
            }
            throw new QMError("Failed to patch requested resource");
        }

        return response;
    }

    private createLabelPatch(resourceName: string, resourceKind: string, apiVersion: string, labels: { [key: string]: string }) {
        const labelPatch = ResourceFactory.baseResource(resourceKind, apiVersion);
        labelPatch.metadata = {
            name: resourceName,
            labels,
        };
        return labelPatch;
    }
}
