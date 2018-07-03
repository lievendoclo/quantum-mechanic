import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    success,
    Tags,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import axios from "axios";
import {QMConfig} from "../../config/QMConfig";
import {ChannelMessageClient, handleQMError, QMError} from "../shared/Error";
import {isSuccessCode} from "../shared/Http";
import {NewDevOpsEnvironment} from "./DevOpsEnvironment";
import {AddMemberToTeam} from "./JoinTeam";

@EventHandler("Display a helpful message when the bot joins a channel",
    `subscription BotJoinedChannel {
  UserJoinedChannel {
    user {
      isAtomistBot
      screenName
      userId
    }
    channel {
      botInvitedSelf
      channelId
      name
      repos {
        name
        owner
        org {
          provider {
            url
          }
        }
      }
      team {
        id
        orgs {
          owner
          ownerType
          provider {
            apiUrl
          }
          repo {
            name
            owner
          }
        }
      }
    }
  }
}`)
@Tags("atomist", "channel")
export class BotJoinedChannel implements HandleEvent<any> {

    @MappedParameter(MappedParameters.SlackChannelName)
    public slackChannelName: string;

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        const botJoinedChannel = event.data.UserJoinedChannel[0];
        logger.info(`BotJoinedChannelEvent: ${JSON.stringify(botJoinedChannel)}`);

        try {
            const teams = await this.getTeams(botJoinedChannel.channel.name);
            if (!JSON.stringify(teams.data).includes("_embedded")) {
                return await success();
            }

            if (botJoinedChannel.user.isAtomistBot === "true") {
                let channelNameString = "your";
                if (botJoinedChannel.channel.name !== null) {
                    // necessary because channel.name is null for private channels
                    channelNameString = `the ${botJoinedChannel.channel.name}`;
                }
                return await this.sendBotTeamWelcomeMessage(ctx, channelNameString, botJoinedChannel.channel.channelId);
            }
            return await success();
        } catch (error) {
            return await handleQMError(new ChannelMessageClient(ctx).addDestination(botJoinedChannel.channel.channelId), error);
        }
    }

    private async sendBotTeamWelcomeMessage(ctx: HandlerContext, channelNameString: string, channelId: string) {
        const msg: SlackMessage = {
            text: `Welcome to ${channelNameString} team channel!`,
            attachments: [{
                fallback: `Welcome to the ${channelNameString} team channel!`,
                footer: `For more information, please read the ${this.docs()}`,
                text: `
If you haven't already, you might want to:

• create an OpenShift DevOps environment
• add new team members
                                                          `,
                mrkdwn_in: ["text"],
                thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
                actions: [
                    buttonForCommand(
                        {text: "Create DevOps environment"},
                        new NewDevOpsEnvironment()),
                    buttonForCommand(
                        {text: "Add team members"},
                        new AddMemberToTeam()),
                ],
            }],
        };
        return ctx.messageClient.addressChannels(msg, channelId);
    }

    private async getTeams(channelName: string) {
        const teams = await axios.get(`${QMConfig.subatomic.gluon.baseUrl}/teams?slackTeamChannel=${channelName}`);

        if (!isSuccessCode(teams.status)) {
            throw new QMError("Unable to connect to Subatomic. Please check your connection");
        }

        return teams;
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/new-to-subatomic`,
            "documentation")}`;
    }
}
