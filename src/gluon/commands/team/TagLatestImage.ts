import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Tags,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {inspect} from "util";
import {v4 as uuid} from "uuid";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {OCService} from "../../services/openshift/OCService";
import {getProjectDevOpsId} from "../../util/project/Project";
import {
    handleQMError,
    QMError,
    ResponderMessageClient,
} from "../../util/shared/Error";
import {createMenu} from "../../util/shared/GenericMenu";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/shared/RecursiveParameterRequestCommand";
import {menuForTeams} from "../../util/team/Teams";

@CommandHandler("Tag an individual subatomic image to a devops environment ", QMConfig.subatomic.commandPrefix + " tag image")
@Tags("subatomic", "devops", "team", "openshift", "images")
export class TagLatestImage extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        description: "team name",
    })
    public teamName: string;

    @RecursiveParameter({
        description: "image name",
    })
    public imageName: string;

    constructor(private gluonService = new GluonService(), private ocService = new OCService()) {
        super();
    }

    protected runCommand(ctx: HandlerContext) {
        try {
            return this.tagImage(
                ctx,
            );
        } catch (error) {
            return handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected async setNextParameter(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
            try {
                const team = await this.gluonService.teams.gluonTeamForSlackTeamChannel(this.teamChannel);
                this.teamName = team.name;
                return await this.handle(ctx);
            } catch (slackChannelError) {
                const teams = await this.gluonService.teams.gluonTeamsWhoSlackScreenNameBelongsTo(this.screenName);
                return await menuForTeams(
                    ctx,
                    teams,
                    this,
                    "Please select a team whose DevOps environment you would like to update");
            }
        }
        if (_.isEmpty(this.imageName)) {
            const imagesResult = await this.ocService.getSubatomicImageStreamTags();
            const images = JSON.parse(imagesResult.output).items;
            return await createMenu(
                ctx,
                images.map(image => {
                    return {
                        value: image.metadata.name,
                        text: image.metadata.name,
                    };
                }),
                this,
                "Please select the image you would like tagged to your project",
                "Select Image",
                "imageName");

        }
    }

    private async tagImage(ctx: HandlerContext) {
        const messageId = uuid();
        const devopsEnvironment = getProjectDevOpsId(this.teamName);
        await ctx.messageClient.respond(`Tagging selected image to devops environment *${devopsEnvironment}*...`, {id: messageId});
        await this.ocService.login();
        const project = this.ocService.findProject(devopsEnvironment);
        if (project === null) {
            throw new QMError(`No devops environment for team ${this.teamName} has been provisioned yet.`);
        }
        try {
            await this.ocService.tagSubatomicImageToNamespace(this.imageName, devopsEnvironment);
        } catch (error) {
            logger.error(`Failed to tag selected image to project ${devopsEnvironment}. Error: ${inspect(error)}`);
            throw new QMError("Image tagging failed. Please contact your system administrator for assistance.");
        }
        return ctx.messageClient.respond(`Image successfully tagged to devops environment *${devopsEnvironment}*.`, {id: messageId});
    }
}
