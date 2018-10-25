import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Tags,
} from "@atomist/automation-client";
import {QMConfig} from "../../../config/QMConfig";
import {TeamMembershipMessages} from "../../messages/member/TeamMembershipMessages";
import {BitbucketService} from "../../services/bitbucket/BitbucketService";
import {GluonService} from "../../services/gluon/GluonService";
import {ConfigureBitbucketProjectRecommendedPractices} from "../../tasks/bitbucket/ConfigureBitbucketProjectRecommendedPractices";
import {TaskListMessage} from "../../tasks/TaskListMessage";
import {TaskRunner} from "../../tasks/TaskRunner";
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
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";
import {isUserAMemberOfTheTeam} from "../../util/team/Teams";

@CommandHandler("Apply recommended practices to bitbucket project", QMConfig.subatomic.commandPrefix + " apply bitbucket practices")
@Tags("bitbucket", "project")
export class BitbucketProjectRecommendedPracticesCommand extends RecursiveParameterRequestCommand
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
        recursiveKey: BitbucketProjectRecommendedPracticesCommand.RecursiveKeys.projectName,
        selectionMessage: "Please select the project you wish to configure the Bitbucket project for",
    })
    public projectName: string;

    @RecursiveParameter({
        recursiveKey: BitbucketProjectRecommendedPracticesCommand.RecursiveKeys.teamName,
        selectionMessage: "Please select a team associated with the project you wish to configure the Bitbucket project for",
    })
    public teamName: string;

    private teamMembershipMessages: TeamMembershipMessages = new TeamMembershipMessages();

    constructor(public gluonService = new GluonService(), public bitbucketService = new BitbucketService()) {
        super();
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(BitbucketProjectRecommendedPracticesCommand.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(BitbucketProjectRecommendedPracticesCommand.RecursiveKeys.projectName, setGluonProjectName);
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Team: ${this.teamName}, Project: ${this.projectName}`);

        const messageClient: ResponderMessageClient = new ResponderMessageClient(ctx);

        try {
            const member = await this.gluonService.members.gluonMemberFromScreenName(this.screenName);

            const requestingTeam = await this.gluonService.teams.gluonTeamByName(this.teamName);

            const project = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);

            if (!isUserAMemberOfTheTeam(member, requestingTeam)) {
                return await messageClient.send(this.teamMembershipMessages.notAMemberOfTheTeam());
            }

            const taskListMessage: TaskListMessage = new TaskListMessage(":rocket: Configuring Bitbucket Project recommended practices...", messageClient);
            const taskRunner: TaskRunner = new TaskRunner(taskListMessage);

            const associatedTeams = await this.gluonService.teams.getTeamsAssociatedToProject(project.projectId);
            for (const team of associatedTeams) {
                taskRunner.addTask(
                    new ConfigureBitbucketProjectRecommendedPractices(team, project, this.bitbucketService),
                );
            }
            await taskRunner.execute(ctx);

            return await messageClient.send("Successfully applied recommended practices to Bitbucket project!");
        } catch (error) {
            return await handleQMError(messageClient, error);
        }
    }

}
