import {HandlerContext, logger} from "@atomist/automation-client";
import {GluonService} from "../../services/gluon/GluonService";
import {AddMemberToTeamService} from "../../services/team/AddMemberToTeamService";
import {
    getScreenName,
    loadScreenNameByUserId,
    MemberRole,
} from "../../util/member/Members";
import {getTeamSlackChannel} from "../../util/team/Teams";
import {Task} from "../Task";
import {TaskListMessage} from "../TaskListMessage";

export class AddMemberToTeamTask extends Task {

    private readonly TASK_GATHER_REQUEST_DETAILS = TaskListMessage.createUniqueTaskName("GatherRequestDetails");
    private readonly TASK_ADD_USER_TO_TEAM = TaskListMessage.createUniqueTaskName("AddUserToTeam");

    constructor(private slackName: string,
                private screenName: string,
                private teamName: string,
                private memberRole: MemberRole,
                private addMemberToTeamService = new AddMemberToTeamService(),
                private gluonService = new GluonService()) {
        super();
    }

    protected configureTaskListMessage(taskListMessage: TaskListMessage) {
        taskListMessage.addTask(this.TASK_GATHER_REQUEST_DETAILS, "Gather required membership request details");
        taskListMessage.addTask(this.TASK_ADD_USER_TO_TEAM, "Add user to team with role: " + this.memberRole.toString());
    }

    protected async executeTask(ctx: HandlerContext): Promise<boolean> {

        const team = await this.gluonService.teams.gluonTeamByName(this.teamName);

        const teamChannel = getTeamSlackChannel(team);

        logger.info(`Adding member [${this.slackName}] to team: ${this.teamName}`);

        const screenName = getScreenName(this.slackName);

        const chatId = await loadScreenNameByUserId(ctx, screenName);

        logger.info(`Got ChatId: ${chatId}`);

        const newMember = await this.addMemberToTeamService.getNewMemberGluonDetails(ctx, chatId, teamChannel);

        this.addMemberToTeamService.verifyAddMemberRequest(newMember, team, this.memberRole);

        logger.info(`Gluon member found: ${JSON.stringify(newMember)}`);

        const actioningMember = await this.gluonService.members.gluonMemberFromScreenName(this.screenName);

        await this.taskListMessage.succeedTask(this.TASK_GATHER_REQUEST_DETAILS);

        await this.addMemberToTeamService.addUserToGluonTeam(newMember.memberId, actioningMember.memberId, team.teamId, this.memberRole);

        await this.taskListMessage.succeedTask(this.TASK_ADD_USER_TO_TEAM);

        return true;
    }

}
