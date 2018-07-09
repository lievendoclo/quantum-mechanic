import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    success,
    Tags,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {addBotToSlackChannel} from "@atomist/lifecycle-automation/handlers/command/slack/AddBotToChannel";
import {inviteUserToSlackChannel} from "@atomist/lifecycle-automation/handlers/command/slack/AssociateRepo";
import {createChannel} from "@atomist/lifecycle-automation/handlers/command/slack/CreateChannel";
import {SlackMessage, url} from "@atomist/slack-messages";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {
    handleQMError,
    logErrorAndReturnSuccess,
    QMError,
    ResponderMessageClient,
} from "../../util/shared/Error";
import {isSuccessCode} from "../../util/shared/Http";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/shared/RecursiveParameterRequestCommand";
import {menuForTeams, TeamService} from "../../util/team/TeamService";
import {CreateTeam} from "./CreateTeam";

@CommandHandler("Check whether to create a new team channel or use an existing channel")
@Tags("subatomic", "slack", "channel", "team")
export class NewOrUseTeamSlackChannel implements HandleCommand {

    @Parameter({
        description: "team name",
    })
    public teamName: string;

    @Parameter({
        description: "team channel name",
        required: false,
    })
    public teamChannel: string;

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        const text: string = `\
Would you like to create a new team channel called *${this.teamChannel}* or \
if you have an existing channel you'd like to use for team wide messages, \
rather use that instead?\
        `;
        const msg: SlackMessage = {
            text,
            attachments: [{
                fallback: `Do you want to create a new team channel (${this.teamChannel}) or link an existing one?`,
                footer: `For more information, please read the ${this.docs()}`,
                actions: [
                    buttonForCommand(
                        {text: `Create channel ${this.teamChannel}`},
                        new NewTeamSlackChannel(),
                        {
                            teamId: ctx.teamId,
                            teamName: this.teamName,
                            teamChannel: this.teamChannel,
                        }),
                    buttonForCommand(
                        {text: "Use an existing channel"},
                        new LinkExistingTeamSlackChannel(),
                        {
                            teamId: ctx.teamId,
                            teamName: this.teamName,
                        }),
                ],
            }],
        };
        return await ctx.messageClient.respond(msg);
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/user-guide/create-a-team#associate-a-slack-channel`,
            "documentation")}`;
    }
}

@CommandHandler("Create team channel", QMConfig.subatomic.commandPrefix + " create team channel")
@Tags("subatomic", "slack", "channel", "team")
export class NewTeamSlackChannel implements HandleCommand {

    @MappedParameter(MappedParameters.SlackTeam)
    public teamId: string;

    @Parameter({
        description: "team name",
    })
    public teamName: string;

    @Parameter({
        description: "team channel name",
        required: false,
        displayable: false,
    })
    public teamChannel: string;

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            this.teamChannel = _.isEmpty(this.teamChannel) ? this.teamName : this.teamChannel;
            return await linkSlackChannelToGluonTeam(ctx, this.teamName, this.teamId, this.teamChannel, this.docs(), true);
        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#create-team-channel`,
            "documentation")}`;
    }

    private async handleError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }
}

@CommandHandler("Link existing team channel", QMConfig.subatomic.commandPrefix + " link team channel")
@Tags("subatomic", "slack", "channel", "team")
export class LinkExistingTeamSlackChannel extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public slackScreenName: string;

    @MappedParameter(MappedParameters.SlackTeam)
    public teamId: string;

    @RecursiveParameter({
        description: "team name",
    })
    public teamName: string;

    @Parameter({
        description: "team channel name",
        required: true,
    })
    public teamChannel: string;

    constructor(private teamService = new TeamService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext) {
        return await linkSlackChannelToGluonTeam(ctx, this.teamName, this.teamId, this.teamChannel, this.docs(), false);
    }

    protected async setNextParameter(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
            try {
                const teams = await this.teamService.gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.slackScreenName);
                return await menuForTeams(
                    ctx,
                    teams,
                    this,
                    "Please select the team you would like to link the slack channel to");
            } catch (error) {
                return await logErrorAndReturnSuccess(this.teamService.gluonTeamsWhoSlackScreenNameBelongsTo.name, error);
            }
        }
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#link-team-channel`,
            "documentation")}`;
    }
}

async function linkSlackChannelToGluonTeam(ctx: HandlerContext,
                                           gluonTeamName: string,
                                           slackTeamId: string,
                                           slackChannelName: string,
                                           documentationLink: string,
                                           isNewChannel: boolean): Promise<HandlerResult> {
    let finalisedSlackChannelName: string = slackChannelName;
    if (isNewChannel) {
        finalisedSlackChannelName = _.kebabCase(slackChannelName);
    }

    const teamQueryResult = await axios.get(`${QMConfig.subatomic.gluon.baseUrl}/teams?name=${gluonTeamName}`);

    if (isSuccessCode(teamQueryResult.status)) {
        const team = teamQueryResult.data._embedded.teamResources[0];

        logger.info(`Updating team channel [${finalisedSlackChannelName}]: ${team.teamId}`);

        await axios.put(`${QMConfig.subatomic.gluon.baseUrl}/teams/${team.teamId}`,
            {
                slack: {
                    teamChannel: finalisedSlackChannelName,
                },
            });

        return await createTeamSlackChannel(ctx, slackTeamId, slackChannelName, team);
    } else {
        return await requestNonExistentTeamsCreation(ctx, gluonTeamName, documentationLink);
    }
}

async function createTeamSlackChannel(ctx: HandlerContext, slackTeamId: string, slackChannelName: string, team): Promise<HandlerResult> {
    try {
        const channel = await createChannel(ctx, slackTeamId, slackChannelName);
        if (channel && channel.createSlackChannel) {
            await addBotToSlackChannel(ctx, slackTeamId, channel.createSlackChannel.id);

            await inviteListOfGluonMembersToChannel(ctx, slackTeamId, channel.createSlackChannel.id, slackChannelName, team.members);

            await inviteListOfGluonMembersToChannel(ctx, slackTeamId, channel.createSlackChannel.id, slackChannelName, team.owners);

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

async function inviteListOfGluonMembersToChannel(ctx: HandlerContext, slackTeamId: string, channelId: string, slackChannelName: string, memberList): Promise<void> {
    for (const member of memberList) {
        try {
            await tryInviteGluonMemberToChannel(ctx, member.memberId, slackTeamId, channelId);
        } catch (err) {
            // Don't outright fail. Just alert the user.
            await ctx.messageClient.respond(`❗Unable to invite member "${member.firstName} ${member.lastName}" to channel ${slackChannelName}. Failed with error message: ${err.message}`);
        }
    }
}

async function tryInviteGluonMemberToChannel(ctx: HandlerContext,
                                             gluonMemberId: string,
                                             slackTeamId: string,
                                             slackChannelId: string): Promise<any> {
    logger.info("Creating promise to find and add member: " + gluonMemberId);
    const memberQueryResponse = await axios.get(`${QMConfig.subatomic.gluon.baseUrl}/members/${gluonMemberId}`);

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

async function requestNonExistentTeamsCreation(ctx: HandlerContext, gluonTeamName: string, documentationLink: string) {
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
