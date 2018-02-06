import {HandlerContext} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import axios from "axios";
import * as _ from "lodash";
import {CreateTeam} from "./CreateTeam";
import {JoinTeam} from "./JoinTeam";

export function teamsWhoScreenNameBelongsToo(ctx: HandlerContext, screenName: string): Promise<any[]> {
    return axios.get(`http://localhost:8080/teams?slackScreenName=${screenName}`)
        .then(teams => {
            if (!_.isEmpty(teams.data._embedded)) {
                return Promise.resolve(teams.data._embedded.teamResources);
            }

            return ctx.messageClient.respond({
                text: "Unfortunately, you are not a member of any teams. You must be a member of at least one team to associate this new project too.",
                attachments: [{
                    text: "You can either create a new team or apply to join an existing team",
                    actions: [
                        // TODO add support for this later
                        buttonForCommand(
                            {
                                text: "Apply to join a team",
                                style: "primary",
                            },
                            new JoinTeam()),
                        buttonForCommand(
                            {text: "Create a new team"},
                            new CreateTeam()),
                    ],
                }],
            })
                .then(() => Promise.reject(`${screenName} does not belong to any teams`));
        });
}
