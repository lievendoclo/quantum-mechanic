import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import {QMConfig} from "../../../config/QMConfig";
import {CreateTeam} from "../../commands/team/CreateTeam";
import {LinkExistingTeamSlackChannel} from "../../commands/team/LinkExistingTeamSlackChannel";
import {NewTeamSlackChannel} from "../../commands/team/NewSlackChannel";

export class TeamSlackChannelMessages {
    public requestNonExistentTeamsCreation(gluonTeamName: string, commandReferenceDocsExtension: string): SlackMessage {
        return {
            text: `There was an error creating your *${gluonTeamName}* team channel`,
            attachments: [{
                text: `
Unfortunately this team does not seem to exist on Subatomic.
To create a team channel you must first create a team. Click the button below to do that now.
                                                  `,
                fallback: "Team does not exist on Subatomic",
                footer: `For more information, please read the ${this.docs(commandReferenceDocsExtension)}`,
                color: "#D94649",
                mrkdwn_in: ["text"],
                actions: [
                    buttonForCommand(
                        {
                            text: "Create team",
                        },
                        new CreateTeam()),
                ],
            }],
        };
    }

    public createNewOrUseExistingSlackChannel(teamChannel: string, teamName: string, teamId: string): SlackMessage {
        const text: string = `\
Would you like to create a new team channel called *${teamChannel}* or \
if you have an existing channel you'd like to use for team wide messages, \
rather use that instead?\
        `;
        return {
            text,
            attachments: [{
                fallback: `Do you want to create a new team channel (${teamChannel}) or link an existing one?`,
                footer: `For more information, please read the ${this.docs()}`,
                actions: [
                    buttonForCommand(
                        {text: `Create channel ${teamChannel}`},
                        new NewTeamSlackChannel(),
                        {
                            teamId,
                            teamName,
                            teamChannel,
                        }),
                    buttonForCommand(
                        {text: "Use an existing channel"},
                        new LinkExistingTeamSlackChannel(),
                        {
                            teamId,
                            teamName,
                        }),
                ],
            }],
        };
    }

    private docs(extension: string = ""): string {
        if (extension.length !== 0) {
            extension = "#" + extension;
        }
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference${extension}`,
            "documentation")}`;
    }
}
