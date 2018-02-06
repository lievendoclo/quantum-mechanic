import {
    CommandHandler, failure, HandleCommand, HandlerContext, HandlerResult,
    logger, MappedParameter, MappedParameters, Parameter, success, Tags,
} from "@atomist/automation-client";
import {
    buttonForCommand,
    menuForCommand,
} from "@atomist/automation-client/spi/message/MessageClient";
import {inviteUserToSlackChannel} from "@atomist/lifecycle-automation/handlers/command/slack/AssociateRepo";
import {SlackMessage, url} from "@atomist/slack-messages";
import axios from "axios";
import * as config from "config";
import * as _ from "lodash";
import * as graphql from "../../typings/types";

@CommandHandler("Apply to join an existing team", config.get("subatomic").commandPrefix + " apply to team")
@Tags("subatomic", "team")
export class JoinTeam implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUser)
    public slackName: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        return axios.get("http://localhost:8080/teams")
            .then( teams => {
                logger.info(`Got teams data: ${JSON.stringify(teams.data)}`);

                // remove teams that he is already a member of - TODO in future

                // present the list of teams as a select
                const msg: SlackMessage = {
                    text: "Please select the team you would like to join",
                    attachments: [{
                        fallback: "Some buttons",
                        actions: [
                            menuForCommand({
                                    text: "Select Team", options:
                                        teams.data._embedded.teamResources.map(team => {
                                            return {
                                                value: _.kebabCase(team.name),
                                                text: team.name,
                                            };
                                        }),
                                },
                                // TODO this command should notify the team channel of the application
                                // the options would be to add this member to the team or decline him
                                // in which case the member should be notified of the outcome

                                // don't make this complicated for now.
                                // just send a message that he wants to join - that's it
                                "AddMemberToTeam", "teamChannel",
                                {slackName: this.slackName}),
                        ],
                    }],
                };

                return ctx.messageClient.addressUsers(msg, this.slackName)
                    .then(success);
            });
    }

    private docs(): string {
        return `${url("https://subatomic.bison.absa.co.za/docs/teams#join",
            "documentation")}`;
    }
}

@CommandHandler("Add a member to a team", config.get("subatomic").commandPrefix + " add member")
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
        description: "slack name of the member to add",
    })
    public slackName: string;

    @Parameter({
        description: "the role this member should have in the team",
    })
    public role: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Adding member [${this.slackName}] to team: ${this.teamChannel}`);

        let screenName = this.slackName;
        if (this.slackName.startsWith("<@")) {
            screenName = _.replace(this.slackName, /(<@)|>/g, "");
        }

        return this.loadScreenNameByUserId(ctx, screenName)
            .then(chatId => {
                if (!_.isEmpty(chatId)) {
                    logger.info(`Got ChatId: ${chatId}`);
                    return axios.get(`http://localhost:8080/members?slackScreenName=${chatId}`)
                        .then(newMember => {
                            logger.info(`Member: ${JSON.stringify(newMember.data)}`);
                            if (!_.isEmpty(newMember.data._embedded)) {
                                logger.info(`Getting teams that ${this.screenName} (you) are a part of...`);

                                return axios.get(`http://localhost:8080/members?slackScreenName=${this.screenName}`)
                                    .then(member => {
                                        if (!_.isEmpty(member.data._embedded)) {
                                            const you = member.data._embedded.teamMemberResources[0];
                                            logger.info(`Got member's teams you belong too: ${JSON.stringify(you)}`);

                                            const teamSlackChannel = _.find(you.teams,
                                                (team: any) => team.slack.teamChannel === this.teamChannel);
                                            logger.info(`Found team Slack channel: ${JSON.stringify(teamSlackChannel)}`);
                                            if (!_.isEmpty(teamSlackChannel)) {
                                                const newTeamMember = newMember.data._embedded.teamMemberResources[0];
                                                const newMemberId = newTeamMember.memberId;
                                                logger.info(`Adding member [${newMemberId}] to team with ${JSON.stringify(teamSlackChannel._links.self.href)}`);
                                                return axios.put(teamSlackChannel._links.self.href,
                                                    {
                                                        members: [{
                                                            memberId: newMemberId,
                                                        }],
                                                    })
                                                    .then(() => {
                                                        logger.info(`Added team member! Inviting to channel [${this.channelId}] -> member [${screenName}]`);
                                                        return inviteUserToSlackChannel(ctx,
                                                            this.teamId,
                                                            this.channelId,
                                                            screenName)
                                                            .then(() => {
                                                                const msg: SlackMessage = {
                                                                    text: `Welcome to the team *${newTeamMember.firstName}*!`,
                                                                    attachments: [{
                                                                        text: `
Welcome *${newTeamMember.firstName}*, you have been added to the *${teamSlackChannel.name}* team by <@${you.slack.userId}>.
Click the button below to become familiar with the projects this team is involved in.
                                                                              `,
                                                                        fallback: `Welcome to the team ${newTeamMember.firstName}`,
                                                                        footer: `For more information, please read the ${this.docs()}`, // TODO use actual icon
                                                                        mrkdwn_in: ["text"],
                                                                        actions: [
                                                                            buttonForCommand(
                                                                                {text: "Show team projects"},
                                                                                this),
                                                                        ],
                                                                    }],
                                                                };

                                                                return ctx.messageClient.addressChannels(msg, this.teamChannel);
                                                            }, reason => logger.error(reason));
                                                    })
                                                    .catch(err => failure(err));
                                            } else {
                                                return ctx.messageClient.respond({
                                                    text: "This is not a team channel or not a team channel you belong too",
                                                    attachments: [{
                                                        text: `
This channel (*${this.teamChannel}*) is not a team channel for a team that you belong too.
You can only invite a new member to your team from a team channel that you belong too. Please retry this in one of those team channels.
                                                              `,
                                                        color: "#D94649",
                                                        mrkdwn_in: ["text"],
                                                    }],
                                                });
                                            }
                                        } else {
                                            // TODO deal with the fact that the requester is not part of any teams
                                        }
                                    })
                                    .catch(err => failure(err));

                                // call Gluon (in future use local cache) to create the link
                            } else {
                                const msg: SlackMessage = {
                                    text: `There was an issue adding ${this.slackName} to your team`,
                                    attachments: [{
                                        text: `
It appears ${this.slackName} is not onboarded onto Subatomic.

They must first be onboarded onto Subatomic _before_ they can be added to a team. Please ask them to onboard by asking them to type \`@atomist subatomic onboard me\`
                            `,
                                        fallback: `${this.slackName} is not onboarded onto Subatomic`,
                                        footer: `For more information, please read the ${this.docs()}`, // TODO use actual icon
                                        color: "#D94649",
                                        mrkdwn_in: ["text"],
                                    }],
                                };

                                return ctx.messageClient.respond(msg);
                            }
                        });
                } else {
                    return ctx.messageClient.respond({
                        text: `The Slack name you typed (${this.slackName}) does not appear to be a valid Slack user`,
                        attachments: [{
                            text: `
Adding a team member from Slack requires typing their \`@mention\` name or using their actual Slack screen name.
                                  `,
                            fallback: `${this.slackName} is not onboarded onto Subatomic`,
                            footer: `For more information, please read the ${this.docs()}`, // TODO use actual icon
                            color: "#D94649",
                            mrkdwn_in: ["text"],
                        }, {
                            text: "Tip: You can get your Slack screen name by typing `@atomist subatomic whoami`",
                            color: "#00a5ff",
                            mrkdwn_in: ["text"],
                        }],
                    });
                }
            })
            .then(success)
            .catch(err => failure(err));

        // respond to member that he has been added to the team and
        // that he has the X role assigned to him.
    }

    // see loadChatIdByChatId
    private loadScreenNameByUserId(ctx: HandlerContext, userId: string): Promise<graphql.ChatId.ChatId> {
        return ctx.graphClient.executeQueryFromFile<graphql.ChatId.Query, graphql.ChatId.Variables>(
            "graphql/query/chatIdByUserId",
            {userId})
            .then(result => {
                if (result) {
                    if (result.ChatId && result.ChatId.length > 0) {
                        return result.ChatId[0].screenName;
                    }
                }
                return null;
            })
            .catch(err => {
                logger.error("Error occurred running GraphQL query: %s", err);
                return null;
            });
    }

    private docs(): string {
        return `${url("https://subatomic.bison.absa.co.za/docs/teams",
            "documentation")}`;
    }
}
