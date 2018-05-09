import {HandlerContext} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {CreateTeam} from "./CreateTeam";
import {JoinTeam} from "./JoinTeam";

export function gluonTeamsWhoSlackScreenNameBelongsTo(ctx: HandlerContext, screenName: string): Promise<any[]> {
    return axios.get(`${QMConfig.subatomic.gluon.baseUrl}/teams?slackScreenName=${screenName}`)
        .then(teams => {
            if (!_.isEmpty(teams.data._embedded)) {
                return Promise.resolve(teams.data._embedded.teamResources);
            }

            return ctx.messageClient.respond({
                // TODO this message should be customisable, as this function is used elsewhere
                text: "Unfortunately, you are not a member of any team. To associate this project you need to be a member of at least one team.",
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
                .then(() => Promise.reject(`${screenName} does not belong to any team`));
        });
}

export function gluonTeamForSlackTeamChannel(teamChannel: string): Promise<any> {
    return axios.get(`${QMConfig.subatomic.gluon.baseUrl}/teams?slackTeamChannel=${teamChannel}`)
        .then(teams => {
            if (!_.isEmpty(teams.data._embedded)) {
                if (teams.data._embedded.teamResources.length === 1) {
                    return Promise.resolve(teams.data._embedded.teamResources[0]);
                } else {
                    throw new RangeError("Multiple teams associated with the same Slack team channel is not expected");
                }
            } else {
                return Promise.reject(`No team associated with Slack team channel: ${teamChannel}`);
            }
        });
}
