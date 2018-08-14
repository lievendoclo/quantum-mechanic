import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import {SlackMessage, url} from "@atomist/slack-messages";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {OCService} from "../../services/openshift/OCService";
import {
    GluonTeamNameSetter,
    setGluonTeamName,
} from "../../util/recursiveparam/GluonParameterSetters";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/recursiveparam/RecursiveParameterRequestCommand";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";

@CommandHandler("Add a new Subatomic Config Server", QMConfig.subatomic.commandPrefix + " add config server")
export class AddConfigServer extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        recursiveKey: AddConfigServer.RecursiveKeys.teamName,
    })
    public teamName: string;

    @Parameter({
        description: "Remote Git repository SSH",
        pattern: /^ssh:\/\/.*$/,
    })
    public gitUri: string;

    constructor(public gluonService = new GluonService(),
                private ocService = new OCService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            await this.ocService.login();
            return await this.addConfigServer(
                ctx,
                this.teamName,
                this.gitUri,
            );
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(AddConfigServer.RecursiveKeys.teamName, setGluonTeamName);
    }

    private async addConfigServer(ctx: HandlerContext,
                                  gluonTeamName: string,
                                  gitUri: string): Promise<any> {
        const devOpsProjectId = `${_.kebabCase(gluonTeamName).toLowerCase()}-devops`;
        await this.addConfigServerSecretToDevOpsEnvironment(devOpsProjectId);

        await this.createConfigServerConfigurationMap(devOpsProjectId);

        await this.tagConfigServerImageToDevOpsEnvironment(devOpsProjectId);

        await this.addViewRoleToDevOpsEnvironmentDefaultServiceAccount(devOpsProjectId);

        await this.createConfigServerDeploymentConfig(gitUri, devOpsProjectId);

        await this.sendSuccessResponse(ctx, devOpsProjectId);
    }

    private async addConfigServerSecretToDevOpsEnvironment(devOpsProjectId: string) {
        try {
            await this.ocService.createConfigServerSecret(devOpsProjectId);
        } catch (error) {
            logger.warn("Secret subatomic-config-server probably already exists");
        }
    }

    private async createConfigServerConfigurationMap(devOpsProjectId: string) {
        const configurationMapDefintion = {
            apiVersion: "v1",
            kind: "ConfigMap",
            metadata: {
                name: "subatomic-config-server",
            },
            data: {
                "application.yml": `
spring:
  cloud:
    config:
      server:
        git:
          ignoreLocalSshSettings: true
          strictHostKeyChecking: false
          hostKeyAlgorithm: ssh-rsa
`,
            },
        };
        return await this.ocService.createResourceFromDataInNamespace(configurationMapDefintion, devOpsProjectId);
    }

    private async tagConfigServerImageToDevOpsEnvironment(devOpsProjectId: string) {
        return await this.ocService.tagSubatomicImageToNamespace(
            "subatomic-config-server:1.1",
            devOpsProjectId,
            "subatomic-config-server:1.0");
    }

    private async addViewRoleToDevOpsEnvironmentDefaultServiceAccount(devOpsProjectId: string) {
        return await this.ocService.addRoleToUserInNamespace(
            `system:serviceaccount:${devOpsProjectId}:default`,
            "view",
            devOpsProjectId);
    }

    private async createConfigServerDeploymentConfig(gitUri: string, devOpsProjectId: string) {
        try {
            await this.ocService.getDeploymentConfigInNamespace("subatomic-config-server", devOpsProjectId);
            logger.warn(`Subatomic Config Server Template has already been processed, deployment exists`);
        } catch (error) {
            const saneGitUri = _.replace(gitUri, /(<)|>/g, "");

            const templateParameters = [
                `GIT_URI=${saneGitUri}`,
                `IMAGE_STREAM_PROJECT=${devOpsProjectId}`,
                // TODO relook once we have a designed https://github.com/orgs/absa-subatomic/projects/2#card-7672800
                `IMAGE_STREAM_TAG=1.0`,
            ];

            const appTemplate = await this.ocService.processOpenshiftTemplate(
                "subatomic-config-server-template",
                "subatomic",
                templateParameters);

            logger.debug(`Processed Subatomic Config Server Template: ${appTemplate.output}`);

            await this.ocService.createResourceFromDataInNamespace(JSON.parse(appTemplate.output), devOpsProjectId);
        }
    }

    private async sendSuccessResponse(ctx: HandlerContext, devOpsProjectId: string) {
        const slackMessage: SlackMessage = {
            text: `Your Subatomic Config Server has been added to your *${devOpsProjectId}* OpenShift project successfully`,
            attachments: [{
                fallback: `Your Subatomic Config Server has been added successfully`,
                footer: `For more information, please read the ${this.docs()}`,
            }],
        };

        return await ctx.messageClient.addressChannels(slackMessage, this.teamChannel);
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/config-server`,
            "documentation")}`;
    }

}
