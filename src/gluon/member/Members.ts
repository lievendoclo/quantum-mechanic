import {HandlerContext, logger} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import axios from "axios";
import * as _ from "lodash";
import {OnboardMember} from "./Onboard";

export function memberFromScreenName(ctx: HandlerContext,
                                     screenName: string,
                                     message: string = "This command requires an onboarded member"): Promise<any> {
    return axios.get(`http://localhost:8080/members?slackScreenName=${screenName}`)
        .then(members => {
            if (!_.isEmpty(members.data._embedded)) {
                return Promise.resolve(members.data._embedded.teamMemberResources[0]);
            } else {
                const msg: SlackMessage = {
                    text: message,
                    attachments: [{
                        text: `
Unfortunately you do not seem to have been onboarded to Subatomic.
To create a team you must first onboard yourself. Click the button below to do that now.
                            `,
                        fallback: "You are not onboarded to Subatomic",
                        footer: `For more information, please read the ${url("https://subatomic.bison.absa.co.za/docs/teams",
                            "documentation")}`, // TODO use actual icon
                        color: "#ffcc00",
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

                return ctx.messageClient.respond(msg)
                    .then(() => Promise.reject(
                        `Member with screen name ${screenName} is not onboarded`));
            }
        });
}
