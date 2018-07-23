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
import {QMConfig} from "../../../config/QMConfig";
import {NewDevOpsEnvironment} from "../../commands/team/DevOpsEnvironment";
import {AddMemberToTeam} from "../../commands/team/JoinTeam";
import {GluonService} from "../../services/gluon/GluonService";
import {
    ChannelMessageClient,
    handleQMError,
    QMError,
} from "../../util/shared/Error";

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

    constructor(private gluonService = new GluonService()) {
    }

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        const botJoinedChannel = event.data.UserJoinedChannel[0];
        logger.info(`BotJoinedChannelEvent: ${JSON.stringify(botJoinedChannel)}`);

        const teams = await this.getTeams(botJoinedChannel.channel.name);
        if (teams == null) {
            return await success();
        }

        try {
            if (botJoinedChannel.user.isAtomistBot === "true") {
                const channelNameString = `the ${botJoinedChannel.channel.name}`;

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
        let result = null;
        try {
            result = await this.gluonService.teams.gluonTeamForSlackTeamChannel(channelName);
        } catch (error) {
            if (!(error instanceof QMError)) {
                throw error;
            }
        }
        return result;
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}`,
            "documentation")}`;
    }
}
