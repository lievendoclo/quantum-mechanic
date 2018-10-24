import {
    CommandHandler,
    HandlerContext,
    HandlerResult, logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    Tags,
} from "@atomist/automation-client";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {TaskListMessage} from "../../tasks/TaskListMessage";
import {TaskRunner} from "../../tasks/TaskRunner";
import {RemoveMemberFromTeamTask} from "../../tasks/team/RemoveMemberFromTeamTask";
import {MemberRole} from "../../util/member/Members";
import {
    GluonTeamNameSetter,
    setGluonTeamName,
} from "../../util/recursiveparam/GluonParameterSetters";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/recursiveparam/RecursiveParameterRequestCommand";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";

@CommandHandler("Remove a member from a team", QMConfig.subatomic.commandPrefix + " remove team member")
@Tags("subatomic", "team", "member")
export class RemoveMemberFromTeam extends RecursiveParameterRequestCommand implements GluonTeamNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackTeam)
    public teamId: string;

    @MappedParameter(MappedParameters.SlackChannel)
    public channelId: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "slack name (@User.Name) of the member to remove from a team",
    })
    public slackName: string;

    @RecursiveParameter({
        recursiveKey: RemoveMemberFromTeam.RecursiveKeys.teamName,
        selectionMessage: "Please select a team you would like to remove a member from",
    })
    public teamName: string;

    constructor(public gluonService = new GluonService()) {
        super();
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(RemoveMemberFromTeam.RecursiveKeys.teamName, setGluonTeamName);
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            const taskListMessage: TaskListMessage = new TaskListMessage(`🚀 Removing member from team started:`,
                new ResponderMessageClient(ctx));
            const taskRunner: TaskRunner = new TaskRunner(taskListMessage);
            taskRunner.addTask(new RemoveMemberFromTeamTask(this.slackName, this.screenName, this.teamName, MemberRole.member));
            await taskRunner.execute(ctx);
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }
}
