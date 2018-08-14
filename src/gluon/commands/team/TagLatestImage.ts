import {
    CommandHandler,
    HandlerContext,
    logger,
    MappedParameter,
    MappedParameters,
    Tags,
} from "@atomist/automation-client";
import {inspect} from "util";
import {v4 as uuid} from "uuid";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {OCService} from "../../services/openshift/OCService";
import {getProjectDevOpsId} from "../../util/project/Project";
import {
    GluonTeamNameSetter,
    setGluonTeamName,
} from "../../util/recursiveparam/GluonParameterSetters";
import {setImageName} from "../../util/recursiveparam/OpenshiftParameterSetters";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/recursiveparam/RecursiveParameterRequestCommand";
import {
    handleQMError,
    QMError,
    ResponderMessageClient,
} from "../../util/shared/Error";

@CommandHandler("Tag an individual subatomic image to a devops environment ", QMConfig.subatomic.commandPrefix + " tag image")
@Tags("subatomic", "devops", "team", "openshift", "images")
export class TagLatestImage extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        imageName: "IMAGE_NAME",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        recursiveKey: TagLatestImage.RecursiveKeys.teamName,
        selectionMessage: "Please select the team you would like to tag the image to",
    })
    public teamName: string;

    @RecursiveParameter({
        recursiveKey: TagLatestImage.RecursiveKeys.imageName,
        selectionMessage: "Please select the image you would like tagged to your DevOps environment",
    })
    public imageName: string;

    constructor(public gluonService = new GluonService(), private ocService = new OCService()) {
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

    protected configureParameterSetters() {
        this.addRecursiveSetter(TagLatestImage.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(TagLatestImage.RecursiveKeys.imageName, setImageName);
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
