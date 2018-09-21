import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import {QMConfig} from "../../../config/QMConfig";
import {ListTeamProjects} from "../../commands/project/ProjectDetails";

export class AddMemberToTeamMessages {
    public welcomeMemberToTeam(newMemberFirstName: string, teamSlackChannelName: string): SlackMessage {
        return {
            text: `Welcome to the team *${newMemberFirstName}*!`,
            attachments: [{
                text: `
Welcome *${newMemberFirstName}*, you have been added to the *${teamSlackChannelName}* team.
Click the button below to become familiar with the projects this team is involved in.
                                                                              `,
                fallback: `Welcome to the team ${newMemberFirstName}`,
                footer: `For more information, please read the ${this.docs("list-projects")}`,
                mrkdwn_in: ["text"],
                thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
                actions: [
                    buttonForCommand(
                        {text: "Show team projects"},
                        new ListTeamProjects()),
                ],
            }],
        };
    }

    private docs(extension): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#${extension}`,
            "documentation")}`;
    }
}
