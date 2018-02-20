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
} from "@atomist/automation-client";
import axios from "axios";
import {QMConfig} from "../../config/QMConfig";

@CommandHandler("Add Slack details to an existing team member", QMConfig.subatomic.commandPrefix + " add slack")
export class AddSlackDetails implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackUser)
    public userId: string;

    @Parameter({
        description: "ABSA email address",
        pattern: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
    })
    public email: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Adding Slack details for member: ${this.email}`);

        return axios.get(`${QMConfig.subatomic.gluon.baseUrl}/members?email=${this.email}`)
            .then(member => {
                logger.info(`Found existing member: ${member.data._embedded.teamMemberResources[0].memberId}`);
                return axios.put(
                    `${QMConfig.subatomic.gluon.baseUrl}/members/${member.data._embedded.teamMemberResources[0].memberId}`,
                    {
                        slack: {
                            screenName: this.screenName,
                            userId: this.userId,
                        },
                    })
                    .then(gluonMember => {
                        return ctx.messageClient.respond({
                            text: `Thanks *${gluonMember.data.firstName}*, your Slack details have been added to your Subatomic profile. 👍`,
                        });

                        // TODO check if they've been added to any teams?
                        // If not, provide button to JoinTeam
                    })
                    // TODO send a response if no member is found
                    // Include a button to onboard a new member
                    .catch(err => failure(err));
            })
            .catch(err => failure(err));
    }
}

@CommandHandler("Display your Slack user details", QMConfig.subatomic.commandPrefix + " whoami")
export class Whoami implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackUser)
    public userId: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        return ctx.messageClient.respond({
            text: `
*Slack screen name:* ${this.screenName}
*Slack user Id:* ${this.userId}
                  `,
        });
    }
}
