import {HandlerContext, logger} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {inviteUserToSlackChannel} from "@atomist/lifecycle-automation/handlers/command/slack/AssociateRepo";
import {SlackMessage, url} from "@atomist/slack-messages";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {isSuccessCode} from "../../../http/Http";
import {OnboardMember} from "../../commands/member/OnboardMember";
import {AddMemberToTeam} from "../../commands/team/AddMemberToTeam";
import {AddMemberToTeamMessages} from "../../messages/team/AddMemberToTeamMessages";
import {QMError} from "../../util/shared/Error";
import {loadChannelIdByChannelName} from "../../util/team/Teams";
import {GluonService} from "../gluon/GluonService";

export class AddMemberToTeamService {

    public addMemberToTeamMessages: AddMemberToTeamMessages = new AddMemberToTeamMessages();

    constructor(private gluonService = new GluonService()) {
    }

    public async getNewMember(ctx: HandlerContext, chatId: string, teamChannel: string) {
        try {
            const newMember = await this.gluonService.members.gluonMemberFromScreenName(chatId);

            return this.partOfTeam(newMember, teamChannel);
        } catch (error) {
            const isQMError = error instanceof QMError;
            if (!isQMError || (isQMError && error.message === `${chatId} is already a member of this team.`)) {
                throw error;
            }
            await this.onboardMessage(ctx, chatId, teamChannel);
            const errorMessage = `Failed to get member's details. Member *${chatId}* appears to not be onboarded.`;
            const msg: SlackMessage = {
                text: errorMessage,
                attachments: [{
                    text: `
They have been sent a request to onboard, once they've successfully onboarded you can re-run the command or click the button below.
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

    public async inviteUserToSlackChannel(ctx: HandlerContext,
                                          newMemberFirstName: string,
                                          gluonTeamName: string,
                                          channelName: string,
                                          screenName: string,
                                          slackName: string) {
        try {
            logger.info(`Added team member! Inviting to channel [${channelName}] -> member [${screenName}]`);
            const channelId = await loadChannelIdByChannelName(ctx, channelName);
            logger.info("Channel ID: " + channelId);
            await inviteUserToSlackChannel(ctx,
                ctx.workspaceId,
                channelId,
                screenName);

            const message = this.addMemberToTeamMessages.welcomeMemberToTeam(newMemberFirstName, gluonTeamName);

            return await ctx.messageClient.addressChannels(message, channelName);
        } catch (error) {
            logger.warn(error);
            return await ctx.messageClient.addressChannels(`User ${slackName} successfully added to your gluon team. Private channels do not currently support automatic user invitation.` +
                " Please invite the user to this slack channel manually.", channelName);
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

    private async partOfTeam(newMember, teamChannel: string) {
        if (!_.isEmpty(_.find(newMember.teams,
            (team: any) => team.slack.teamChannel === teamChannel))) {
            throw new QMError(`${newMember.slack.screenName} is already a member of this team.`);
        }
        return newMember;
    }

    private async onboardMessage(ctx, chatId: string, teamChannel: string) {
        const msg: SlackMessage = {
            text: `Someone tried to add you to the team channel ${teamChannel}.`,
            attachments: [{
                text: `
Unfortunately you do not seem to have been onboarded to Subatomic.
Click the button below to do that now.
                            `,
                fallback: "You are not onboarded to Subatomic",
                footer: `For more information, please read the ${url(`${QMConfig.subatomic.docs.baseUrl}/teams`,
                    "documentation")}`,
                color: "#ffcc00",
                mrkdwn_in: ["text"],
                thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
                actions: [
                    buttonForCommand(
                        {
                            text: "Onboard me",
                        },
                        new OnboardMember()),
                ],
            }],
        };
        return await ctx.messageClient.addressUsers(msg, chatId);
    }
}
