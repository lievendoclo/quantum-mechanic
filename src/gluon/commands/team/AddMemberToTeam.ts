import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    Tags,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {AddMemberToTeamMessages} from "../../messages/team/AddMemberToTeamMessages";
import {GluonService} from "../../services/gluon/GluonService";
import {AddMemberToTeamService} from "../../services/team/AddMemberToTeamService";
import {getScreenName, loadScreenNameByUserId} from "../../util/member/Members";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";

@CommandHandler("Add a member to a team", QMConfig.subatomic.commandPrefix + " add teamMinimal member")
@Tags("subatomic", "team", "member")
export class AddMemberToTeam implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackTeam)
    public teamId: string;

    @MappedParameter(MappedParameters.SlackChannel)
    public channelId: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "slack name (@User.Name) of the member to add",
    })
    public slackName: string;

    public addMemberToTeamMessages: AddMemberToTeamMessages = new AddMemberToTeamMessages();

    constructor(private gluonService = new GluonService(), private addMemberToTeamService = new AddMemberToTeamService()) {
    }

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            logger.info(`Adding member [${this.slackName}] to team: ${this.teamChannel}`);

            const screenName = getScreenName(this.slackName);

            const chatId = await loadScreenNameByUserId(ctx, screenName);

            logger.info(`Got ChatId: ${chatId}`);

            const newMember = await this.addMemberToTeamService.getNewMember(chatId, this.teamChannel);

            logger.info(`Gluon member found: ${JSON.stringify(newMember)}`);

            logger.info(`Getting teams that ${this.screenName} (you) are a part of...`);

            const actioningMember = await this.gluonService.members.gluonMemberFromScreenName(this.screenName);

            logger.info(`Got member's teams you belong to: ${JSON.stringify(actioningMember)}`);

            const teamSlackChannel = _.find(actioningMember.teams,
                (team: any) => team.slack.teamChannel === this.teamChannel);

            if (!_.isEmpty(teamSlackChannel)) {
                await this.addMemberToTeamService.addUserToGluonTeam(newMember.memberId, actioningMember.memberId, teamSlackChannel._links.self.href);
                return await this.addMemberToTeamService.inviteUserToSlackChannel(
                    ctx,
                    newMember.firstName,
                    actioningMember.slack.userId,
                    teamSlackChannel.name,
                    this.channelId,
                    newMember.slack.userId,
                    this.teamId,
                    this.teamChannel,
                    this.slackName);
            } else {
                return ctx.messageClient.respond(this.addMemberToTeamMessages.alertTeamDoesNotExist(this.teamChannel));
            }
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }
}
