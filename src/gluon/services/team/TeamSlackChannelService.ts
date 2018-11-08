import {HandlerContext, logger} from "@atomist/automation-client";
import {addBotToSlackChannel} from "@atomist/lifecycle-automation/lib/handlers/command/slack/AddBotToChannel";
import {inviteUserToSlackChannel} from "@atomist/lifecycle-automation/lib/handlers/command/slack/AssociateRepo";
import {createChannel} from "@atomist/lifecycle-automation/lib/handlers/command/slack/CreateChannel";
import {CreateSlackChannel} from "@atomist/lifecycle-automation/lib/typings/types";
import * as _ from "lodash";
import {isSuccessCode} from "../../../http/Http";
import {TeamSlackChannelMessages} from "../../messages/team/TeamSlackChannelMessages";
import {QMError} from "../../util/shared/Error";
import {GluonService} from "../gluon/GluonService";

export class TeamSlackChannelService {

    public teamSlackChannelMessages: TeamSlackChannelMessages = new TeamSlackChannelMessages();

    constructor(private gluonService = new GluonService()) {
    }

    public async linkSlackChannelToGluonTeam(ctx: HandlerContext,
                                             gluonTeamName: string,
                                             slackTeamId: string,
                                             slackChannelName: string,
                                             commandReferenceDocsExtension: string,
                                             isNewChannel: boolean): Promise<any> {

        const team = await this.getGluonTeam(gluonTeamName, commandReferenceDocsExtension);

        await this.addSlackDetailsToGluonTeam(team.teamId, slackChannelName, isNewChannel);

        const channel = await this.createTeamSlackChannel(ctx, slackTeamId, slackChannelName);

        if (channel.createSlackChannel != null) {
            await this.inviteListOfGluonMembersToChannel(ctx, slackTeamId, channel.createSlackChannel.id, slackChannelName, team.members);

            await this.inviteListOfGluonMembersToChannel(ctx, slackTeamId, channel.createSlackChannel.id, slackChannelName, team.owners);
        }

    }

    public async getGluonTeam(gluonTeamName, commandReferenceDocsExtension): Promise<any> {
        try {
            return await this.gluonService.teams.gluonTeamByName(gluonTeamName);
        } catch (error) {
            throw new QMError(`Failed to find to gluon team ${gluonTeamName}`,
                this.teamSlackChannelMessages.requestNonExistentTeamsCreation(gluonTeamName, commandReferenceDocsExtension));
        }
    }

    public async addSlackDetailsToGluonTeam(gluonTeamId: string,
                                            slackChannelName: string,
                                            isNewChannel: boolean) {
        let finalisedSlackChannelName: string = slackChannelName;
        if (isNewChannel) {
            finalisedSlackChannelName = _.kebabCase(slackChannelName);
        }

        logger.info(`Updating team channel [${finalisedSlackChannelName}]: ${gluonTeamId}`);

        const result = await this.gluonService.teams.addSlackDetailsToTeam(gluonTeamId, {
            slack: {
                teamChannel: finalisedSlackChannelName,
            },
        });

        if (!isSuccessCode(result.status)) {
            throw new QMError(`Failed to add slack details to team with id ${gluonTeamId}`);
        }
    }

    public async createTeamSlackChannel(ctx: HandlerContext, slackTeamId: string, slackChannelName: string): Promise<CreateSlackChannel.Mutation> {
        try {
            const channel = await createChannel(ctx, slackTeamId, slackChannelName);
            if (channel && channel.createSlackChannel) {
                await addBotToSlackChannel(ctx, slackTeamId, channel.createSlackChannel.id);

                return channel;
            }
            // allow error to fall through to final return otherwise
        } catch (err) {
            if (err.networkError && err.networkError.response && !isSuccessCode(err.networkError.response.status)) {
                return await ctx.messageClient.respond(`❗ The channel has been successfully linked to your team but since the channel *${slackChannelName}* is private` +
                    ` the atomist bot cannot be automatically invited. Please manually invite the atomist bot using the \`/invite @atomist\` command in the *${slackChannelName}* slack channel.` +
                    ` You will then need to manually invite your team members to the *${slackChannelName}* channel using the \`/invite @teamMembersName\`.`);
            }
            // allow error to fall through to final return otherwise
        }
        throw new QMError(`Channel with channel name ${slackChannelName} could not be created.`);

    }

    public async inviteListOfGluonMembersToChannel(ctx: HandlerContext, slackTeamId: string, channelId: string, slackChannelName: string, memberList: any[]): Promise<void> {
        for (const member of memberList) {
            try {
                await this.tryInviteGluonMemberToChannel(ctx, member.memberId, slackTeamId, channelId);
            } catch (err) {
                // Don't outright fail. Just alert the user.
                await ctx.messageClient.respond(`❗Unable to invite member "${member.firstName} ${member.lastName}" to channel ${slackChannelName}. Failed with error message: ${err.message}`);
            }
        }
    }

    public async tryInviteGluonMemberToChannel(ctx: HandlerContext,
                                               gluonMemberId: string,
                                               slackTeamId: string,
                                               slackChannelId: string): Promise<any> {
        logger.info("Creating promise to find and add member: " + gluonMemberId);
        const memberQueryResponse = await this.gluonService.members.gluonMemberFromMemberId(gluonMemberId);

        if (!isSuccessCode(memberQueryResponse.status)) {
            throw new QMError("Unable to find member");
        }

        const member = memberQueryResponse.data;
        if (!_.isEmpty(member.slack)) {
            logger.info(`Inviting member: ${member.firstName}`);
            return await inviteUserToSlackChannel(ctx, slackTeamId, slackChannelId, member.slack.userId);
        } else {
            throw new QMError("User has no associated slack id to invite");
        }
    }

}
