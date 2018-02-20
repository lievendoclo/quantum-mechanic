import {
    EventFired,
    EventHandler,
    failure,
    HandleEvent,
    HandlerContext,
    HandlerResult, logger, MappedParameter, MappedParameters,
    Secret,
    Secrets, success,
    Success,
    Tags,
} from "@atomist/automation-client";
import * as GraphQL from "@atomist/automation-client/graph/graphQL";
import {
    addressSlackChannels,
    buttonForCommand,
    menuForCommand,
    MenuSpecification,
    OptionGroup,
} from "@atomist/automation-client/spi/message/MessageClient";
import * as slack from "@atomist/slack-messages/SlackMessages";
import * as _ from "lodash";
import * as graphql from "../../typings/types";
import {NewDevOpsEnvironment} from "./DevOpsEnvironment";
import {SlackMessage, url} from "@atomist/slack-messages";
import {AddMemberToTeam} from "./JoinTeam";

@EventHandler("Display a helpful message when the bot joins a channel",
    GraphQL.subscriptionFromFile("./graphql/subscriptions/botJoinedChannel"))
@Tags("enrollment")
export class BotJoinedChannel implements HandleEvent<graphql.BotJoinedChannel.Subscription> {

    @MappedParameter(MappedParameters.SlackChannelName)
    public slackChannelName: string;

    private docs(): string {
        return `${url("https://subatomic.bison.absa.co.za/docs/teams#slack",
            "documentation")}`;
    }

    public handle(event: EventFired<graphql.BotJoinedChannel.Subscription>, ctx: HandlerContext): Promise<HandlerResult> {
        const botJoinedChannel = event.data.UserJoinedChannel[0];
        if(botJoinedChannel.user.isAtomistBot === "true"){
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
        }
        else{
            return Promise.resolve(success());
        }

    }
}
