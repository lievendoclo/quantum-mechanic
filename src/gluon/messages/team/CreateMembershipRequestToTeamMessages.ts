import {SlackMessage, url} from "@atomist/slack-messages";
import {QMConfig} from "../../../config/QMConfig";

export class CreateMembershipRequestToTeamMessages {
    public alertGluonMemberForSlackMentionDoesNotExist(slackName: string): SlackMessage {
        return {
            text: `The Slack name you typed (${slackName}) does not appear to be a valid Slack user`,
            attachments: [{
                text: `Adding a team member from Slack requires typing their \`@mention\` name or using their actual Slack screen name.`,
                fallback: `${slackName} is not onboarded onto Subatomic`,
                footer: `For more information, please read the ${this.docs("onboard-me")}`,
                color: "#D94649",
                mrkdwn_in: ["text"],
                thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
            }, {
                text: `Tip: You can get your Slack screen name by typing \`@atomist whoami\``,
                fallback: `Tip: You can get your Slack screen name by typing \`@atomist whoami\``,
                color: "#00a5ff",
                mrkdwn_in: ["text"],
            }],
        };
    }

    private docs(extension): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#${extension}`,
            "documentation")}`;
    }
}
