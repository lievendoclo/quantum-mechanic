import {HandlerContext, logger} from "@atomist/automation-client";
import {handleError} from "@atomist/lifecycle-automation/handlers/command/github/gitHubApi";
import {GluonService} from "../../services/gluon/GluonService";
import {RemoveMemberFromTeamService} from "../../services/team/RemoveMemberFromTeamService";
import {
    getScreenName,
    loadScreenNameByUserId,
    MemberRole,
} from "../../util/member/Members";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";
import {getTeamSlackChannel} from "../../util/team/Teams";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

export class RemoveMemberFromTeamTask extends Task {

    private readonly TASK_GATHER_REQUEST_DETAILS = TaskListMessage.createUniqueTaskName("GatherRequestDetails");
    private readonly TASK_REMOVE_USER_FROM_TEAM = TaskListMessage.createUniqueTaskName("RemoveUserFromTeam");

    constructor(private slackName: string,
                private screenName: string,
                private teamName: string,
                private memberRole: MemberRole,
                private removeMemberFromTeamService = new RemoveMemberFromTeamService(),
                private gluonService = new GluonService()) {
        super();
    }

    protected configureTaskListMessage(taskListMessage: TaskListMessage) {
        taskListMessage.addTask(this.TASK_GATHER_REQUEST_DETAILS, "Gather required membership request details");
        taskListMessage.addTask(this.TASK_REMOVE_USER_FROM_TEAM, "Remove user from team with role: " + this.memberRole.toString());
    }

    protected async executeTask(ctx: HandlerContext): Promise<boolean> {
        try {
            const team = await this.gluonService.teams.gluonTeamByName(this.teamName);
            const teamChannel = getTeamSlackChannel(team);
            const screenName = getScreenName(this.slackName);
            const chatId = await loadScreenNameByUserId(ctx, screenName);
            const newMember = await this.removeMemberFromTeamService.getMemberGluonDetails(ctx, chatId, teamChannel);
            this.removeMemberFromTeamService.verifyCanRemoveMemberRequest(newMember, team, this.memberRole);

            const actioningMember = await this.gluonService.members.gluonMemberFromScreenName(this.screenName);
            await this.taskListMessage.succeedTask(this.TASK_GATHER_REQUEST_DETAILS);
            await this.removeMemberFromTeamService.removeUserFromGluonTeam(newMember.memberId, actioningMember.memberId, team.teamId, this.memberRole);

            await this.taskListMessage.succeedTask(this.TASK_REMOVE_USER_FROM_TEAM);
            return true;
        } catch (error) {
            logger.error(`error: ${error.message}`);
            return false;
        }
    }

}
