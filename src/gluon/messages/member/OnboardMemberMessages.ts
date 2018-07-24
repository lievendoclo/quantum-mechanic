import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import {QMConfig} from "../../../config/QMConfig";
import {CreateTeam} from "../../commands/team/CreateTeam";
import {JoinTeam} from "../../commands/team/JoinTeam";

export class OnboardMemberMessages {
    public presentTeamCreationAndApplicationOptions(firstName: string): SlackMessage {
        const text: string = `
Welcome to the Subatomic environment *${firstName}*!
Next steps are to either join an existing team or create a new one.
                `;

        return {
            text,
            attachments: [{
                fallback: "Welcome to the Subatomic environment",
                footer: `For more information, please read the ${this.docs()}`,
                thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
                actions: [
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
        };
    }

    public docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#joinTeam`,
            "documentation")}`;
    }

}
