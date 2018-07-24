import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import {QMConfig} from "../../../config/QMConfig";
import {ListTeamProjects} from "../../commands/project/ProjectDetails";

export class AddMemberToTeamMessages {
    public welcomeMemberToTeam(newMemberFirstName: string, teamSlackChannelName: string, actioningMemberSlackUserId: string): SlackMessage {
        return {
            text: `Welcome to the team *${newMemberFirstName}*!`,
            attachments: [{
                text: `
Welcome *${newMemberFirstName}*, you have been added to the *${teamSlackChannelName}* team by <@${actioningMemberSlackUserId}>.
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

    public alertTeamDoesNotExist(teamChannel: string): SlackMessage {
        return {
            text: "This is not a team channel or not a team channel you belong to",
            attachments: [{
                text: `
This channel (*${teamChannel}*) is not a team channel for a team that you belong to.
You can only invite a new member to your team from a team channel that you belong to. Please retry this in one of those team channels.
                                                              `,
                fallback: "This is not a team channel or not a team channel you belong to",
                color: "#D94649",
                mrkdwn_in: ["text"],
            }],
        };
    }

    private docs(extension): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#${extension}`,
            "documentation")}`;
    }
}
