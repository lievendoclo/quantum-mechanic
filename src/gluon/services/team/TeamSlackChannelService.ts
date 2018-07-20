import {
    HandlerContext,
    HandlerResult,
    logger,
    success,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {addBotToSlackChannel} from "@atomist/lifecycle-automation/handlers/command/slack/AddBotToChannel";
import {inviteUserToSlackChannel} from "@atomist/lifecycle-automation/handlers/command/slack/AssociateRepo";
import {createChannel} from "@atomist/lifecycle-automation/handlers/command/slack/CreateChannel";
import {SlackMessage} from "@atomist/slack-messages";
import * as _ from "lodash";
import {CreateTeam} from "../../commands/team/CreateTeam";
import {QMError} from "../../util/shared/Error";
import {isSuccessCode} from "../../util/shared/Http";
import {GluonService} from "../gluon/GluonService";

export class TeamSlackChannelService {

    constructor(private gluonService = new GluonService()) {
    }

    public async linkSlackChannelToGluonTeam(ctx: HandlerContext,
                                             gluonTeamName: string,
                                             slackTeamId: string,
                                             slackChannelName: string,
                                             documentationLink: string,
                                             isNewChannel: boolean): Promise<HandlerResult> {
        let finalisedSlackChannelName: string = slackChannelName;
        if (isNewChannel) {
            finalisedSlackChannelName = _.kebabCase(slackChannelName);
        }

        const teamQueryResult = await this.gluonService.teams.gluonTeamByName(gluonTeamName);

        if (isSuccessCode(teamQueryResult.status)) {
            const team = teamQueryResult.data._embedded.teamResources[0];

            logger.info(`Updating team channel [${finalisedSlackChannelName}]: ${team.teamId}`);

            await this.gluonService.teams.addSlackDetailsToTeam(team.teamId, {
                slack: {
                    teamChannel: finalisedSlackChannelName,
                },
            });

            await this.createTeamSlackChannel(ctx, slackTeamId, slackChannelName, team);
        } else {
            return await this.requestNonExistentTeamsCreation(ctx, gluonTeamName, documentationLink);
        }
    }

    private async createTeamSlackChannel(ctx: HandlerContext, slackTeamId: string, slackChannelName: string, team): Promise<HandlerResult> {
        try {
            const channel = await createChannel(ctx, slackTeamId, slackChannelName);
            if (channel && channel.createSlackChannel) {
                await addBotToSlackChannel(ctx, slackTeamId, channel.createSlackChannel.id);

                await this.inviteListOfGluonMembersToChannel(ctx, slackTeamId, channel.createSlackChannel.id, slackChannelName, team.members);

                await this.inviteListOfGluonMembersToChannel(ctx, slackTeamId, channel.createSlackChannel.id, slackChannelName, team.owners);

                return await success();
            }
            // allow error to fall through to final return otherwise
        } catch (err) {
            if (err.networkError && err.networkError.response && err.networkError.response.status === 400) {
                return await ctx.messageClient.respond(`The channel has been successfully linked to your team but since the channel "${slackChannelName}" is private` +
                    ` the atomist bot cannot be automatically invited. Please manually invite the atomist bot using the \`/invite @atomist\` command in the "${slackChannelName}" slack channel.`);
            }
            // allow error to fall through to final return otherwise
        }
        throw new QMError(`Channel with channel name ${slackChannelName} could not be created.`);

    }

    private async inviteListOfGluonMembersToChannel(ctx: HandlerContext, slackTeamId: string, channelId: string, slackChannelName: string, memberList): Promise<void> {
        for (const member of memberList) {
            try {
                await this.tryInviteGluonMemberToChannel(ctx, member.memberId, slackTeamId, channelId);
            } catch (err) {
                // Don't outright fail. Just alert the user.
                await ctx.messageClient.respond(`❗Unable to invite member "${member.firstName} ${member.lastName}" to channel ${slackChannelName}. Failed with error message: ${err.message}`);
            }
        }
    }

    private async tryInviteGluonMemberToChannel(ctx: HandlerContext,
                                                gluonMemberId: string,
                                                slackTeamId: string,
                                                slackChannelId: string): Promise<any> {
        logger.info("Creating promise to find and add member: " + gluonMemberId);
        const memberQueryResponse = await this.gluonService.members.gluonMemberFromMemberId(gluonMemberId);

        if (!isSuccessCode(memberQueryResponse.status)) {
            throw new Error("Unable to find member");
        }

        const member = memberQueryResponse.data;
        if (member.slack !== null) {
            logger.info(`Inviting member: ${member.firstName}`);
            return await inviteUserToSlackChannel(ctx, slackTeamId, slackChannelId, member.slack.userId);
        } else {
            throw new Error("User has no associated slack id to invite");
        }
    }

    private async requestNonExistentTeamsCreation(ctx: HandlerContext, gluonTeamName: string, documentationLink: string) {
        const msg: SlackMessage = {
            text: `There was an error creating your *${gluonTeamName}* team channel`,
            attachments: [{
                text: `
Unfortunately this team does not seem to exist on Subatomic.
To create a team channel you must first create a team. Click the button below to do that now.
                                                  `,
                fallback: "Team does not exist on Subatomic",
                footer: `For more information, please read the ${documentationLink}`,
                color: "#D94649",
                mrkdwn_in: ["text"],
                actions: [
                    buttonForCommand(
                        {
                            text: "Create team",
                        },
                        new CreateTeam()),
                ],
            }],
        };

        return await ctx.messageClient.respond(msg);
    }

}
