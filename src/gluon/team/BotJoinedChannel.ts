import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    success,
    Tags,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import * as graphql from "../../typings/types";
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
export class BotJoinedChannel implements HandleEvent<graphql.BotJoinedChannel.Subscription> {

    @MappedParameter(MappedParameters.SlackChannelName)
    public slackChannelName: string;

    public handle(event: EventFired<graphql.BotJoinedChannel.Subscription>, ctx: HandlerContext): Promise<HandlerResult> {
        const botJoinedChannel = event.data.UserJoinedChannel[0];
        if (botJoinedChannel.user.isAtomistBot === "true") {
            const msg: SlackMessage = {
                text: `Welcome to the ${botJoinedChannel.channel.name} team channel!`,
                attachments: [{
                    fallback: `Welcome to the ${botJoinedChannel.channel.name} team channel!`,
                    footer: `For more information, please read the ${this.docs()}`, // TODO use actual icon
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
                            {teamChannel: botJoinedChannel.channel.name}),
                    ],
                }],
            };
            return ctx.messageClient.addressChannels(msg, botJoinedChannel.channel.channelId);
        } else {
            return Promise.resolve(success());
        }

    }

    private docs(): string {
        return `${url("https://subatomic.bison.absa.co.za/docs/teams#slack",
            "documentation")}`;
    }
}
