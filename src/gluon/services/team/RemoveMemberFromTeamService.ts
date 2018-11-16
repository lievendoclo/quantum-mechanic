import {HandlerContext, logger} from "@atomist/automation-client";
import {addressSlackChannelsFromContext} from "@atomist/automation-client/spi/message/MessageClient";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import {inspect} from "util";
import {QMConfig} from "../../../config/QMConfig";
import {isSuccessCode} from "../../../http/Http";
import {AddMemberToTeam} from "../../commands/team/AddMemberToTeam";
import {AddMemberToTeamMessages} from "../../messages/team/AddMemberToTeamMessages";
import {MemberRole} from "../../util/member/Members";
import {QMError} from "../../util/shared/Error";
import {kickUserFromSlackChannel, loadChannelIdByChannelName} from "../../util/team/Teams";
import {GluonService} from "../gluon/GluonService";

export class RemoveMemberFromTeamService {

    public addMemberToTeamMessages: AddMemberToTeamMessages = new AddMemberToTeamMessages();

    constructor(private gluonService = new GluonService()) {
    }

    public async getMemberGluonDetails(ctx: HandlerContext, chatId: string, teamChannel: string) {
        try {
            return await this.gluonService.members.gluonMemberFromScreenName(chatId);
        } catch (error) {
            const isQMError = error instanceof QMError;
            if (!isQMError || (isQMError && error.message === `${chatId} is already a member of this team.`)) {
                throw error;
            }

            const errorMessage = `Failed to get member's details. Member *${chatId}* appears to not be onboarded.`;
            const msg: SlackMessage = {
                text: errorMessage,
                attachments: [{
                    text: `They have been sent a request to onboard, once they've successfully onboarded you can re-run
                     the command or click the button below.
                            `,
                    fallback: "Failed to get member details.",
                    footer: `For more information, please read the ${url(`${QMConfig.subatomic.docs.baseUrl}/teams`,
                        "documentation")}`,
                    color: "#ffcc00",
                    mrkdwn_in: ["text"],
                    thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
                    actions: [
                        buttonForCommand(
                            {text: "Add team members"},
                            new AddMemberToTeam()),
                    ],
                }],
            };
            throw new QMError(errorMessage, msg);
        }
    }

    public async removeUserFromGluonTeam(memberId: string, actioningMemberId: string, gluonTeamId: string, memberRole: MemberRole = MemberRole.member) {
        const updateTeamResult = await this.gluonService.teams.removeMemberFromTeam(gluonTeamId, memberId, actioningMemberId);
        if (!isSuccessCode(updateTeamResult.status)) {
            logger.error(`Failed to remove member from team: ${inspect(updateTeamResult)}`);
            throw new QMError(`Failed to remove member from the team. Server side failure.`);
        }
    }

    public verifyCanRemoveMemberRequest(newMember: { memberId: string, slack: { screenName: string } }, team: { owners: Array<{ memberId: string }>, members: Array<{ memberId: string }> }, memberRole: MemberRole) {
        if (memberRole !== MemberRole.owner) {
            for (const member of team.members) {
                if (member.memberId !== newMember.memberId) {
                    throw new QMError(`${newMember.slack.screenName} is not a member of this team.`);
                } else {
                    logger.info(`Verified user is not an owner and is a member of the team`);
                }
            }
        } else {
            throw new QMError(`${newMember.slack.screenName} is an owner of this team and cannot be removed.`); // Unable to remove a team owner from a team as of yet. https://github.com/absa-subatomic/quantum-mechanic/issues/464
        }
    }

    public async removeUserFromSlackChannel(ctx: HandlerContext,
                                            newMemberFirstName: string,
                                            gluonTeamName: string,
                                            channelName: string,
                                            screenName: string,
                                            slackName: string) {
        const destination =  await addressSlackChannelsFromContext(ctx, channelName);
        try {
            logger.info(`Removing user ${screenName} from channel ${channelName}...`);
            const channelId = await loadChannelIdByChannelName(ctx, channelName);
            logger.info("Channel ID: " + channelId);

            const chatTeamId = destination.team;
            const userId = screenName;
            await kickUserFromSlackChannel(ctx, chatTeamId, channelId, userId);

            const message = `${slackName} has been removed from the Slack channel: ${channelName}`;
            return await ctx.messageClient.send(message, destination);
        } catch (error) {
            throw new QMError(error,
                `Failed to remove ${slackName} from ${channelName}. The user might already have been removed or has already left. Please double check and remove the user manually if required.`);
        }
    }
}
