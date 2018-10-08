import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    success,
} from "@atomist/automation-client";
import {addressSlackChannelsFromContext} from "@atomist/automation-client/spi/message/MessageClient";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {OCService} from "../../services/openshift/OCService";
import {ConfigurePackageInJenkins} from "../../tasks/packages/ConfigurePackageInJenkins";
import {ConfigurePackageInOpenshift} from "../../tasks/packages/ConfigurePackageInOpenshift";
import {TaskListMessage} from "../../tasks/TaskListMessage";
import {TaskRunner} from "../../tasks/TaskRunner";
import {ApplicationType} from "../../util/packages/Applications";
import {
    GluonApplicationNameSetter,
    GluonProjectNameSetter,
    GluonTeamNameSetter,
    setGluonApplicationName,
    setGluonProjectName,
    setGluonTeamName,
} from "../../util/recursiveparam/GluonParameterSetters";
import {
    JenkinsfileNameSetter,
    setJenkinsfileName,
} from "../../util/recursiveparam/JenkinsParameterSetters";
import {
    ImageNameSetter,
    OpenshiftTemplateSetter,
    setImageNameFromDevOps,
    setOpenshiftTemplate,
} from "../../util/recursiveparam/OpenshiftParameterSetters";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/recursiveparam/RecursiveParameterRequestCommand";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";
import {GluonToEvent} from "../../util/transform/GluonToEvent";

@CommandHandler("Configure an existing application/library", QMConfig.subatomic.commandPrefix + " configure custom package")
export class ConfigurePackage extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter, GluonProjectNameSetter, GluonApplicationNameSetter, JenkinsfileNameSetter, OpenshiftTemplateSetter, ImageNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        projectName: "PROJECT_NAME",
        applicationName: "APPLICATION_NAME",
        openshiftTemplate: "OPENSHIFT_TEMPLATE",
        jenkinsfileName: "JENKINSFILE_NAME",
        baseS2IImage: "BASE_S2I_IMAGE",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        recursiveKey: ConfigurePackage.RecursiveKeys.applicationName,
        selectionMessage: "Please select the package you wish to configure",
    })
    public applicationName: string;

    @RecursiveParameter({
        recursiveKey: ConfigurePackage.RecursiveKeys.projectName,
        selectionMessage: "Please select the owning project of the package you wish to configure",
    })
    public projectName: string;

    @RecursiveParameter({
        recursiveKey: ConfigurePackage.RecursiveKeys.teamName,
        selectionMessage: "Please select a team associated with the project you wish to configure the package for",
    })
    public teamName: string;

    @RecursiveParameter({
        recursiveKey: ConfigurePackage.RecursiveKeys.baseS2IImage,
        description: "Please select the base image for the s2i build",
    })
    public imageName: string;

    @RecursiveParameter({
        recursiveKey: ConfigurePackage.RecursiveKeys.openshiftTemplate,
        selectionMessage: "Please select the correct openshift template for your package",
    })
    public openshiftTemplate: string;

    @RecursiveParameter({
        recursiveKey: ConfigurePackage.RecursiveKeys.jenkinsfileName,
        selectionMessage: "Please select the correct jenkinsfile for your package",
    })
    public jenkinsfileName: string;

    public buildEnvironmentVariables: { [key: string]: string } = {};

    constructor(public gluonService = new GluonService(),
                public ocService = new OCService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            const destination =  await addressSlackChannelsFromContext(ctx, this.teamChannel);
            await ctx.messageClient.send({
                text: "Preparing to configure your package...",
            }, destination);
            return await this.configurePackage(ctx);
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(ConfigurePackage.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(ConfigurePackage.RecursiveKeys.projectName, setGluonProjectName);
        this.addRecursiveSetter(ConfigurePackage.RecursiveKeys.applicationName, setGluonApplicationName);
        this.addRecursiveSetter(ConfigurePackage.RecursiveKeys.baseS2IImage, setImageNameFromDevOps);
        this.addRecursiveSetter(ConfigurePackage.RecursiveKeys.openshiftTemplate, setOpenshiftTemplate);
        this.addRecursiveSetter(ConfigurePackage.RecursiveKeys.jenkinsfileName, setJenkinsfileName);
    }

    private async configurePackage(ctx: HandlerContext): Promise<HandlerResult> {
        const project = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);

        const application = await this.gluonService.applications.gluonApplicationForNameAndProjectName(this.applicationName, this.projectName);

        const taskListMessage = new TaskListMessage(":rocket: Configuring package...", new ResponderMessageClient(ctx));
        const taskRunner = new TaskRunner(taskListMessage);
        if (application.applicationType === ApplicationType.DEPLOYABLE.toString()) {
            taskRunner.addTask(
                new ConfigurePackageInOpenshift(
                    {
                        buildEnvironmentVariables: this.buildEnvironmentVariables,
                        openshiftTemplate: this.openshiftTemplate,
                        baseS2IImage: this.imageName,
                    },
                    {
                        teamName: this.teamName,
                        projectName: this.projectName,
                        packageName: application.name,
                        packageType: application.applicationType,
                        bitbucketRepoRemoteUrl: application.bitbucketRepository.remoteUrl,
                        owningTeamName: project.owningTeam.name,
                    }),
            );
        }
        taskRunner.addTask(
            new ConfigurePackageInJenkins(
                application,
                project,
                GluonToEvent.bitbucketRepository(application),
                GluonToEvent.bitbucketProject(project),
                GluonToEvent.teamMinimal(project.owningTeam),
                this.jenkinsfileName),
        );

        await taskRunner.execute(ctx);

        return success();

    }

}
