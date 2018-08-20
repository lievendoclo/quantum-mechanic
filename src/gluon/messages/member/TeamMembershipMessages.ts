import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import {QMConfig} from "../../../config/QMConfig";
import {JoinTeam} from "../../commands/team/JoinTeam";

export class TeamMembershipMessages {
    public notAMemberOfTheTeam(): SlackMessage {
        const text: string = `❗You are not a member of this team and do not have the required permissions to run this command. Please apply to join the team.`;

        return {
            text,
            attachments: [{
                fallback: "You are not a member of this team.",
                footer: `For more information, please read the ${this.docs()}`,
                thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
                actions: [
                    buttonForCommand(
                        {
                            text: "Apply to join a team",
                            style: "primary",
                        },
                        new JoinTeam()),
                ],
            }],
        };
    }

    public docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#joinTeam`,
            "documentation")}`;
    }

}
