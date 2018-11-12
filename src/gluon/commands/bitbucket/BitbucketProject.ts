import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    success,
    Tags,
} from "@atomist/automation-client";
import {addressSlackChannelsFromContext} from "@atomist/automation-client/spi/message/MessageClient";
import {QMConfig} from "../../../config/QMConfig";
import {isSuccessCode} from "../../../http/Http";
import {BitbucketService} from "../../services/bitbucket/BitbucketService";
import {GluonService} from "../../services/gluon/GluonService";
import {
    GluonProjectNameSetter,
    GluonTeamNameSetter,
    setGluonProjectName,
    setGluonTeamName,
} from "../../util/recursiveparam/GluonParameterSetters";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/recursiveparam/RecursiveParameterRequestCommand";
import {
    handleQMError,
    QMError,
    ResponderMessageClient,
} from "../../util/shared/Error";

@CommandHandler("Create a new Bitbucket project")
export class NewBitbucketProject extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter, GluonProjectNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        projectName: "PROJECT_NAME",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "bitbucket project key",
    })
    public bitbucketProjectKey: string;

    @RecursiveParameter({
        recursiveKey: NewBitbucketProject.RecursiveKeys.projectName,
        selectionMessage: "Please select the project you wish to create a Bitbucket project for",
    })
    public projectName: string;

    @RecursiveParameter({
        recursiveKey: NewBitbucketProject.RecursiveKeys.teamName,
        selectionMessage: "Please select a team associated with the project you wish to create a Bitbucket project for",
        forceSet: false,
    })
    public teamName: string;

    constructor(public gluonService = new GluonService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Team: ${this.teamName}, Project: ${this.projectName}`);

        try {
            const member = await this.gluonService.members.gluonMemberFromScreenName(this.screenName);

            const project = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);

            await this.updateGluonWithBitbucketDetails(project.projectId, this.projectName, project.description, member.memberId);

            return await success();
        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(NewBitbucketProject.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(NewBitbucketProject.RecursiveKeys.projectName, setGluonProjectName);
    }

    private async updateGluonWithBitbucketDetails(projectId: string, projectName: string, projectDescription: string, memberId: string) {
        const updateGluonProjectResult = await this.gluonService.projects.updateProjectWithBitbucketDetails(projectId,
            {
                bitbucketProject: {
                    name: projectName,
                    description: `${projectDescription} [managed by Subatomic]`,
                },
                createdBy: memberId,
            });
        if (!isSuccessCode(updateGluonProjectResult.status)) {
            logger.error(`Unable to register Bitbucket project in gluon. Error ${updateGluonProjectResult.data}`);
            throw new QMError("Failed to update the Subatomic project with specified Bitbucket details.");
        }
    }

    private async handleError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }
}

@CommandHandler("Link an existing Bitbucket project", QMConfig.subatomic.commandPrefix + " link bitbucket project")
@Tags("subatomic", "bitbucket", "project")
export class ListExistingBitbucketProject
    extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter, GluonProjectNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        projectName: "PROJECT_NAME",
    };

    @MappedParameter(MappedParameters.SlackUser)
    public slackName: string;

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "bitbucket project key",
    })
    public bitbucketProjectKey: string;

    @RecursiveParameter({
        recursiveKey: ListExistingBitbucketProject.RecursiveKeys.projectName,
        selectionMessage: "Please select the project you wish to link a Bitbucket project to",
    })
    public projectName: string;

    @RecursiveParameter({
        recursiveKey: ListExistingBitbucketProject.RecursiveKeys.teamName,
        selectionMessage: "Please select a team associated with the project you wish to create a Bitbucket project for",
        forceSet: false,
    })
    public teamName: string;

    constructor(public gluonService = new GluonService(),
                private bitbucketService = new BitbucketService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext) {
        try {
            return await this.configBitbucket(ctx);
        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(ListExistingBitbucketProject.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(ListExistingBitbucketProject.RecursiveKeys.projectName, setGluonProjectName);
    }

    private async configBitbucket(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Team: ${this.teamName}, Project: ${this.projectName}`);

        const member = await this.gluonService.members.gluonMemberFromScreenName(this.screenName);
        const gluonProject = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);

        const projectUiUrl = `${QMConfig.subatomic.bitbucket.baseUrl}/projects/${this.bitbucketProjectKey}`;

        const destination = await addressSlackChannelsFromContext(ctx, this.teamChannel);
        await ctx.messageClient.send({
            text: `🚀 The Bitbucket project with key ${this.bitbucketProjectKey} is being configured...`,
        }, destination);

        const bitbucketProject = await this.getBitbucketProject(this.bitbucketProjectKey);

        await this.updateGluonProjectWithBitbucketDetails(projectUiUrl, member.memberId, gluonProject.projectId, bitbucketProject);

        return await success();
    }

    private async getBitbucketProject(bitbucketProjectKey: string) {
        const bitbucketProjectRequestResult = await this.bitbucketService.bitbucketProjectFromKey(
            bitbucketProjectKey,
        );

        if (!isSuccessCode(bitbucketProjectRequestResult.status)) {
            throw new QMError("Unable to find the specified project in Bitbucket. Please make sure it exists.");
        }

        return bitbucketProjectRequestResult.data;
    }

    private async updateGluonProjectWithBitbucketDetails(bitbucketProjectUiUrl: string, createdByMemberId: string, gluonProject, bitbucketProject) {
        const updateGluonProjectResult = await this.gluonService.projects.updateProjectWithBitbucketDetails(gluonProject,
            {
                bitbucketProject: {
                    bitbucketProjectId: bitbucketProject.id,
                    name: bitbucketProject.name,
                    description: bitbucketProject.description,
                    key: this.bitbucketProjectKey,
                    url: bitbucketProjectUiUrl,
                },
                createdBy: createdByMemberId,
            });

        if (!isSuccessCode(updateGluonProjectResult.status)) {
            throw new QMError(`Failed to update the Subatomic project with the specified Bitbucket details.`);
        }
    }

    private async handleError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }
}
