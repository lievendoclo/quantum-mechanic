import {
    buttonForCommand,
    menuForCommand,
} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import {QMConfig} from "../../../config/QMConfig";
import {CreateTeam} from "../../commands/team/CreateTeam";

export class JoinTeamMessages {
    public presentMenuForTeamSelection(slackName: string, teams): SlackMessage {
        return {
            text: "Please select the team you would like to join",
            attachments: [{
                fallback: "Some buttons",
                actions: [
                    menuForCommand({
                            text: "Select Team", options:
                                teams.map(team => {
                                    return {
                                        value: team.teamId,
                                        text: team.name,
                                    };
                                }),
                        },
                        "CreateMembershipRequestToTeam", "teamId",
                        {slackName}),
                ],
            }],
        };
    }

    public alertUserThatNoTeamsExist(): SlackMessage {
        return {
            text: `❗Unfortunately no teams have been created.`,
            attachments: [{
                fallback: "❗Unfortunately no teams have been created.",
                footer: `For more information, please read ${this.docs()}`,
                thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
                actions: [
                    buttonForCommand(
                        {text: "Create a new team"},
                        new CreateTeam()),
                ],
            }],
        };
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#create-team`,
            "documentation")}`;
    }
}
