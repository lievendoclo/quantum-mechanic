import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult, logger,
    MappedParameter,
    MappedParameters,
    success,
    Tags,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import {QMConfig} from "../../config/QMConfig";
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

    public handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        const botJoinedChannel = event.data.UserJoinedChannel[0];
        logger.info(`BotJoinedChannelEvent: ${JSON.stringify(botJoinedChannel)}`);
        if (botJoinedChannel.user.isAtomistBot === "true") {
            let channelNameString = "your";
            if (botJoinedChannel.channel.name !== null) {
                // necessary because channel.name is null for private channels
                channelNameString = `the ${botJoinedChannel.channel.name}`;
            }
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
            return ctx.messageClient.addressChannels(msg, botJoinedChannel.channel.channelId);
        } else {
            return Promise.resolve(success());
        }

    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/new-to-subatomic`,
            "documentation")}`;
    }
}
