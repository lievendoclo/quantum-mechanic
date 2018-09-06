import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    success,
    Tags,
} from "@atomist/automation-client";
import {inspect} from "util";
import {QMConfig} from "../../../config/QMConfig";
import {isSuccessCode} from "../../../http/Http";
import {TeamMembershipMessages} from "../../messages/member/TeamMembershipMessages";
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

@CommandHandler("Create new OpenShift environments for a project", QMConfig.subatomic.commandPrefix + " request project environments")
@Tags("subatomic", "openshiftNonProd", "project")
export class NewProjectEnvironments extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter, GluonProjectNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        projectName: "PROJECT_NAME",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        recursiveKey: NewProjectEnvironments.RecursiveKeys.projectName,
        selectionMessage: "Please select the projects you wish to provision the environments for",
    })
    public projectName: string = null;

    @RecursiveParameter({
        recursiveKey: NewProjectEnvironments.RecursiveKeys.teamName,
        selectionMessage: "Please select a team associated with the project you wish to provision the environments for",
        forceSet: false,
    })
    public teamName: string = null;

    private teamMembershipMessages = new TeamMembershipMessages();

    constructor(public gluonService = new GluonService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info("Creating new OpenShift environments...");

        try {
            await ctx.messageClient.addressChannels({
                text: `Requesting project environment's for project *${this.projectName}*`,
            }, this.teamChannel);

            const member = await this.gluonService.members.gluonMemberFromScreenName(this.screenName);

            const project = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);

            await this.requestProjectEnvironment(project.projectId, member.memberId);

            return await success();
        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(NewProjectEnvironments.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(NewProjectEnvironments.RecursiveKeys.projectName, setGluonProjectName);
    }

    private async requestProjectEnvironment(projectId: string, memberId: string) {
        const projectEnvironmentRequestResult = await this.gluonService.projects.requestProjectEnvironment(projectId,
            memberId,
        );

        if (!isSuccessCode(projectEnvironmentRequestResult.status)) {
            if (projectEnvironmentRequestResult.status === 403) {
                throw new QMError(`Member ${memberId} is not a member of project ${projectId}.`, this.teamMembershipMessages.notAMemberOfTheTeam());
            } else {
                logger.error(`Failed to request project environment for project ${this.projectName}. Error: ${inspect(projectEnvironmentRequestResult)}`);
                throw new QMError("Failed to request project environment. Network error.");
            }
        }
    }

    private async handleError(ctx: HandlerContext, error) {
        return await handleQMError(new ResponderMessageClient(ctx), error);
    }
}
