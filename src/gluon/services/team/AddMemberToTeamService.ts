import {HandlerContext, logger} from "@atomist/automation-client";
import {inviteUserToSlackChannel} from "@atomist/lifecycle-automation/handlers/command/slack/AssociateRepo";
import * as _ from "lodash";
import {AddMemberToTeamMessages} from "../../messages/team/AddMemberToTeamMessages";
import {QMError} from "../../util/shared/Error";
import {isSuccessCode} from "../../util/shared/Http";
import {GluonService} from "../gluon/GluonService";

export class AddMemberToTeamService {

    public addMemberToTeamMessages: AddMemberToTeamMessages = new AddMemberToTeamMessages();

    constructor(private gluonService = new GluonService()) {
    }

    public async getNewMember(chatId: string, teamChannel: string) {
        const newMember = await this.gluonService.members.gluonMemberFromScreenName(chatId);

        if (!_.isEmpty(_.find(newMember.teams,
            (team: any) => team.slack.teamChannel === teamChannel))) {
            throw new QMError(`${newMember.slack.screenName} is already a member of this team.`);
        }

        return newMember;
    }

    public async inviteUserToSlackChannel(ctx: HandlerContext,
                                          newMemberFirstName: string,
                                          actioningMemberSlackUserId: string,
                                          teamSlackChannelName: string,
                                          channelId: string,
                                          screenName: string,
                                          teamId: string,
                                          teamChannel: string,
                                          slackName: string) {
        try {
            logger.info(`Added team member! Inviting to channel [${channelId}] -> member [${screenName}]`);
            await inviteUserToSlackChannel(ctx,
                teamId,
                channelId,
                screenName);

            const message = this.addMemberToTeamMessages.welcomeMemberToTeam(newMemberFirstName, teamSlackChannelName, actioningMemberSlackUserId);

            return await ctx.messageClient.addressChannels(message, teamChannel);
        } catch (error) {
            logger.warn(error);
            return await ctx.messageClient.addressChannels(`User ${slackName} successfully added to your gluon team. Private channels do not currently support automatic user invitation.` +
                " Please invite the user to this slack channel manually.", teamChannel);
        }
    }

    public async addUserToGluonTeam(newMemberId: string, actioningMemberId: string, gluonTeamUrl: string) {
        logger.info(`Adding member [${newMemberId}] to team ${gluonTeamUrl}`);

        const splitLink = gluonTeamUrl.split("/");
        const gluonTeamId = splitLink[splitLink.length - 1];

        const updateTeamResult = await this.gluonService.teams.addMemberToTeam(gluonTeamId,
            {
                members: [{
                    memberId: newMemberId,
                }],
                createdBy: actioningMemberId,
            });

        if (!isSuccessCode(updateTeamResult.status)) {
            throw new QMError(`Failed to add member to the team. Server side failure.`);
        }
    }
}
