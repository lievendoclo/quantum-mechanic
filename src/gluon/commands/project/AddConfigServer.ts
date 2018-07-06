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
import {NamedSimpleOption} from "../../../openshift/base/options/NamedSimpleOption";
import {SimpleOption} from "../../../openshift/base/options/SimpleOption";
import {OCClient} from "../../../openshift/OCClient";
import {OCCommon} from "../../../openshift/OCCommon";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/shared/RecursiveParameterRequestCommand";
import {menuForTeams, TeamService} from "../../util/team/TeamService";

@CommandHandler("Add a new Subatomic Config Server", QMConfig.subatomic.commandPrefix + " add config server")
export class AddConfigServer extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        description: "team name",
    })
    public gluonTeamName: string;

    @Parameter({
        description: "Remote Git repository URI",
    })
    public gitUri: string;

    constructor(private teamService = new TeamService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            return await this.addConfigServer(
                ctx,
                this.gluonTeamName,
                this.gitUri,
            );
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected async setNextParameter(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.gluonTeamName)) {
            try {
                const team = await this.teamService.gluonTeamForSlackTeamChannel(this.teamChannel);
                this.gluonTeamName = team.name;
            } catch (error) {
                const teams = await this.teamService.gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName);
                return await menuForTeams(
                    ctx,
                    teams,
                    this,
                    "Please select a team, whose DevOps project the Subatomic Config Server will be added to",
                    "gluonTeamName",
                );
            }
        }
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
            await OCCommon.commonCommand("create secret generic",
                "subatomic-config-server",
                [],
                [
                    new NamedSimpleOption("-from-literal=spring.cloud.config.server.git.hostKey", QMConfig.subatomic.bitbucket.cicdKey),
                    new NamedSimpleOption("-from-file=spring.cloud.config.server.git.privateKey", QMConfig.subatomic.bitbucket.cicdPrivateKeyPath),
                    new SimpleOption("-namespace", devOpsProjectId),
                ]);
        } catch (error) {
            logger.warn("Secret subatomic-config-server probably already exists");
        }
    }

    private async createConfigServerConfigurationMap(devOpsProjectId: string) {
        return await OCCommon.createFromData({
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
        }, [
            new SimpleOption("-namespace", devOpsProjectId),
        ]);
    }

    private async tagConfigServerImageToDevOpsEnvironment(devOpsProjectId: string) {
        return await OCCommon.commonCommand("tag",
            "subatomic/subatomic-config-server:1.1",
            [`${devOpsProjectId}/subatomic-config-server:1.0`],
        );
    }

    private async addViewRoleToDevOpsEnvironmentDefaultServiceAccount(devOpsProjectId: string) {
        return await OCClient.policy.addRoleToUser(
            `system:serviceaccount:${devOpsProjectId}:default`,
            "view",
            devOpsProjectId);
    }

    private async createConfigServerDeploymentConfig(gitUri: string, devOpsProjectId: string) {
        try {
            await OCCommon.commonCommand("get", `dc/subatomic-config-server`, [],
                [
                    new SimpleOption("-namespace", devOpsProjectId),
                ]);
            logger.warn(`Subatomic Config Server Template has already been processed, deployment exists`);
        } catch (error) {
            const saneGitUri = _.replace(gitUri, /(<)|>/g, "");
            const appTemplate = await OCCommon.commonCommand("process",
                "subatomic-config-server-template",
                [],
                [
                    new SimpleOption("p", `GIT_URI=${saneGitUri}`),
                    new SimpleOption("p", `IMAGE_STREAM_PROJECT=${devOpsProjectId}`),
                    // TODO relook once we have a designed https://github.com/orgs/absa-subatomic/projects/2#card-7672800
                    new SimpleOption("p", `IMAGE_STREAM_TAG=1.0`),
                    new SimpleOption("-namespace", "subatomic"),
                ],
            );
            logger.debug(`Processed Subatomic Config Server Template: ${appTemplate.output}`);

            await OCCommon.createFromData(JSON.parse(appTemplate.output),
                [
                    new SimpleOption("-namespace", devOpsProjectId),
                ]);
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
