import {
    CommandHandler, failure, HandleCommand, HandlerContext, HandlerResult,
    logger, MappedParameter, MappedParameters, Parameter, success, Tags,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {OnboardMember} from "../member/Onboard";

@CommandHandler("Create a new team", QMConfig.subatomic.commandPrefix + " create team")
@Tags("subatomic", "team")
export class CreateTeam implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @Parameter({
        description: "team name",
    })
    private name: string;

    @Parameter({
        description: "team description",
    })
    private description: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Creating team for member: ${this.screenName}`);
        return axios.get(`http://localhost:8080/members?slackScreenName=${this.screenName}`)
            .then(member => {
                if (!_.isEmpty(member.data._embedded)) {
                    const memberId: string = member.data._embedded.teamMemberResources[0].memberId;
                    return axios.post("http://localhost:8080/teams", {
                        name: this.name,
                        description: this.description,
                        createdBy: memberId,
                    });
                } else {
                    const msg: SlackMessage = {
                        text: `There was an error creating your ${this.name} team`,
                        attachments: [{
                            text: `
Unfortunately you do not seem to have been onboarded to Subatomic.
To create a team you must first onboard yourself. Click the button below to do that now.
                            `,
                            fallback: "You are not onboarded to Subatomic",
                            footer: `For more information, please read the ${this.docs()}`, // TODO use actual icon
                            color: "#D94649",
                            mrkdwn_in: ["text"],
                            actions: [
                                buttonForCommand(
                                    {
                                        text: "Onboard me",
                                    },
                                    new OnboardMember()),
                            ],
                        }],
                    };

                    return ctx.messageClient.respond(msg);
                }
            })
            .catch(err => failure(err));
    }

    private docs(): string {
        return `${url("https://subatomic.bison.absa.co.za/docs/teams",
            "documentation")}`;
    }
}
