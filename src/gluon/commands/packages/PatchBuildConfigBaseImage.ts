import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
} from "@atomist/automation-client";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {OCService} from "../../services/openshift/OCService";
import {PatchPackageBuildConfigImage} from "../../tasks/packages/PatchPackageBuildConfigImage";
import {TaskListMessage} from "../../tasks/TaskListMessage";
import {TaskRunner} from "../../tasks/TaskRunner";
import {
    GluonApplicationNameSetter,
    GluonProjectNameSetter,
    GluonTeamNameSetter,
    setGluonApplicationName,
    setGluonProjectName,
    setGluonTeamName,
} from "../../util/recursiveparam/GluonParameterSetters";
import {
    ImageNameSetter,
    setImageNameFromDevOps,
} from "../../util/recursiveparam/OpenshiftParameterSetters";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/recursiveparam/RecursiveParameterRequestCommand";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";

@CommandHandler("Patch the s2i image used to build a package", QMConfig.subatomic.commandPrefix + " patch package s2i image")
export class PatchBuildConfigBaseImage extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter, GluonProjectNameSetter, GluonApplicationNameSetter, ImageNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        projectName: "PROJECT_NAME",
        applicationName: "APPLICATION_NAME",
        imageName: "IMAGE_NAME",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        recursiveKey: PatchBuildConfigBaseImage.RecursiveKeys.applicationName,
        selectionMessage: "Please select the package you wish to configure",
    })
    public applicationName: string;

    @RecursiveParameter({
        recursiveKey: PatchBuildConfigBaseImage.RecursiveKeys.projectName,
        selectionMessage: "Please select the owning project of the package you wish to configure",
    })
    public projectName: string;

    @RecursiveParameter({
        recursiveKey: PatchBuildConfigBaseImage.RecursiveKeys.teamName,
        selectionMessage: "Please select a team associated with the project you wish to configure the package for",
    })
    public teamName: string;

    @RecursiveParameter({
        recursiveKey: PatchBuildConfigBaseImage.RecursiveKeys.imageName,
        description: "Base image for s2i build",
    })
    public imageName: string;

    public buildEnvironmentVariables: { [key: string]: string } = {};

    constructor(public gluonService = new GluonService(),
                public ocService = new OCService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        const qmMessageClient = new ResponderMessageClient(ctx);
        try {
            const taskListMessage: TaskListMessage = new TaskListMessage(`🚀 Patching of BuildConfig s2i image for package *${this.applicationName}* in project *${this.projectName} * started:`,
                qmMessageClient);
            const taskRunner: TaskRunner = new TaskRunner(taskListMessage);
            taskRunner.addTask(
                new PatchPackageBuildConfigImage(this.imageName, this.applicationName, this.projectName, this.teamName),
            );

            await taskRunner.execute(ctx);

            await qmMessageClient.send("Patching BuildConfig completed successfully!");

        } catch (error) {
            return await handleQMError(qmMessageClient, error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(PatchBuildConfigBaseImage.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(PatchBuildConfigBaseImage.RecursiveKeys.projectName, setGluonProjectName);
        this.addRecursiveSetter(PatchBuildConfigBaseImage.RecursiveKeys.applicationName, setGluonApplicationName);
        this.addRecursiveSetter(PatchBuildConfigBaseImage.RecursiveKeys.imageName, setImageNameFromDevOps);
    }

}
