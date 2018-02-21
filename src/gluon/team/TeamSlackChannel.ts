import {
    CommandHandler,
    failure,
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
import {
    buttonForCommand,
    menuForCommand,
} from "@atomist/automation-client/spi/message/MessageClient";
import {addBotToSlackChannel} from "@atomist/lifecycle-automation/handlers/command/slack/AddBotToChannel";
import {inviteUserToSlackChannel} from "@atomist/lifecycle-automation/handlers/command/slack/AssociateRepo";
import {createChannel} from "@atomist/lifecycle-automation/handlers/command/slack/CreateChannel";
import {SlackMessage, url} from "@atomist/slack-messages";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {CreateTeam} from "./CreateTeam";
import {NewDevOpsEnvironment} from "./DevOpsEnvironment";
import {AddMemberToTeam} from "./JoinTeam";
import {gluonTeamsWhoSlackScreenNameBelongsTo} from "./Teams";

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

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
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
        return ctx.messageClient.respond(msg)
            .then(success);
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/teams#slack`,
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

    public handle(ctx: HandlerContext): Promise<HandlerResult> {

        // TODO this should all move to an event.
        // this should just be a call to Gluon to add the Slack team channel
        // and have an event handler actually create the channel

        this.teamChannel = _.isEmpty(this.teamChannel) ? this.teamName : this.teamChannel;
        return linkSlackChannelToGluonTeam(ctx, this.teamName, this.teamId, this.teamChannel, this.docs());
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/teams`,
            "documentation")}`;
    }
}

@CommandHandler("Link existing team channel", QMConfig.subatomic.commandPrefix + " link team channel")
@Tags("subatomic", "slack", "channel", "team")
export class LinkExistingTeamSlackChannel implements HandleCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public slackScreenName: string;

    @MappedParameter(MappedParameters.SlackTeam)
    public teamId: string;

    @Parameter({
        description: "team name",
        required: false,
        displayable: false,
    })
    public teamName: string = null;

    @Parameter({
        description: "team channel name",
        required: true,
    })
    public teamChannel: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        if (this.teamName === null) {
            return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.slackScreenName)
                .then(teams => {
                    const msg: SlackMessage = {
                        text: "Please select the team you would like to link the slack channel to",
                        attachments: [{
                            fallback: "A menu",
                            actions: [
                                menuForCommand({
                                        text: "Select Team", options:
                                            teams.map(team => {
                                                return {
                                                    value: team.name,
                                                    text: team.name,
                                                };
                                            }),
                                    },
                                    this, "teamName",
                                    {teamChannel: this.teamChannel}),
                            ],
                        }],
                    };

                    return ctx.messageClient.addressUsers(msg, this.slackScreenName)
                        .then(success);
                });
        } else {
            return linkSlackChannelToGluonTeam(ctx, this.teamName, this.teamId, this.teamChannel, this.docs());
        }
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/teams`,
            "documentation")}`;
    }
}

function linkSlackChannelToGluonTeam(ctx: HandlerContext,
                                     gluonTeamName: string,
                                     slackTeamId: string,
                                     slackChannelName: string,
                                     documentationLink: string): Promise<HandlerResult> {
    const kebabbedTeamChannel: string = _.kebabCase(slackChannelName);
    return axios.get(`${QMConfig.subatomic.gluon.baseUrl}/teams?name=${gluonTeamName}`)
        .then(team => {
            if (!_.isEmpty(team.data._embedded)) {
                logger.info(`Updating team channel [${kebabbedTeamChannel}]: ${team.data._embedded.teamResources[0].teamId}`);
                return axios.put(`${QMConfig.subatomic.gluon.baseUrl}/teams/${team.data._embedded.teamResources[0].teamId}`,
                    {
                        slack: {
                            teamChannel: kebabbedTeamChannel,
                        },
                    })
                    .then(() => {
                        return createChannel(ctx, slackTeamId, kebabbedTeamChannel)
                            .then(channel => {
                                if (channel && channel.createSlackChannel) {
                                    return addBotToSlackChannel(ctx, slackTeamId, channel.createSlackChannel.id)
                                        .then(() => {
                                                const members: Array<Promise<any>> = [];
                                                for (const member of team.data._embedded.teamResources[0].members) {
                                                    members.push(
                                                        tryInviteGluonMemberToChannel(ctx, member.memberId, slackTeamId, channel.createSlackChannel.id),
                                                    );
                                                }
                                                for (const owner of team.data._embedded.teamResources[0].owners) {
                                                    members.push(
                                                        tryInviteGluonMemberToChannel(ctx, owner.memberId, slackTeamId, channel.createSlackChannel.id),
                                                    );
                                                }
                                                return Promise.all(members);
                                            },
                                        );
                                } else {
                                    return Promise.reject(`Error creating or finding slack channel: ${JSON.stringify(channel)}`);
                                }
                            }, error => {
                                logger.error(`Error creating Slack channel: ${JSON.stringify(error)}`);

                                if (error.networkError.response.status === 400) {
                                    logger.warn(`Most likely trying to link a private Slack channel: ${error.message}. This is currently NOT SUPPORTED`);
                                } else {
                                    return Promise.reject(`Slack channel could not be created: ${error.message}`);
                                }
                            }).then(() => {

                                // TODO add all existing team members to the team
                                // Slack channel just created

                                const msg: SlackMessage = {
                                    text: `Welcome to the ${slackChannelName} team channel!`,
                                    attachments: [{
                                        fallback: `Welcome to the ${slackChannelName} team channel!`,
                                        footer: `For more information, please read the ${documentationLink}`,
                                        text: `
If you haven't already, you might want to:

• create an OpenShift DevOps environment
• add new team members
                                                          `,
                                        mrkdwn_in: ["text"],
                                        actions: [
                                            buttonForCommand(
                                                {text: "Create DevOps environment"},
                                                new NewDevOpsEnvironment()),
                                            buttonForCommand(
                                                {text: "Add team members"},
                                                new AddMemberToTeam(),
                                                {teamChannel: kebabbedTeamChannel}),
                                        ],
                                    }],
                                };

                                return ctx.messageClient.addressChannels(msg, kebabbedTeamChannel);

                                // TODO respond back after creating team channel and now offer
                                // opportunity to create OpenShift Dev environment?
                            })
                            .catch(err => {
                                logger.error(`An error occurred configuring the team slack channel: ${JSON.stringify(err)}`);
                                return failure(err);
                            });
                    });
            } else {
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

                return ctx.messageClient.respond(msg);
            }
        })
        .catch(e => failure(e));
}

function tryInviteGluonMemberToChannel(ctx: HandlerContext,
                                       gluonMemberId: string,
                                       slackTeamId: string,
                                       slackChannelId: string): Promise<any> {
    logger.info("Creating promise to find and add member: " + gluonMemberId);
    return axios.get(`${QMConfig.subatomic.gluon.baseUrl}/members/${gluonMemberId}`).then(memberResponse => {
        if (!_.isEmpty(memberResponse.data)) {
            const memberResource = memberResponse.data;
            if (memberResource.slack !== null) {
                logger.info(`Inviting member: ${memberResource.firstName}`);
                return inviteUserToSlackChannel(ctx, slackTeamId, slackChannelId, memberResource.slack.userId)
                    .then(() => success());
            }
        }
        return success();
    });
}
