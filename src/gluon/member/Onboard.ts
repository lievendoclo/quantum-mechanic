import {
    CommandHandler,
    failure,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
    Tags,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import axios from "axios";
import {QMConfig} from "../../config/QMConfig";
import {CreateTeam} from "../team/CreateTeam";
import {JoinTeam} from "../team/JoinTeam";

@CommandHandler("Onboard a new team member", QMConfig.subatomic.commandPrefix + " onboard me")
@Tags("subatomic", "slack", "member")
export class OnboardMember implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackUser)
    public userId: string;

    @Parameter({
        displayName: "first name",
        description: "your first name",
    })
    public firstName: string;

    @Parameter({
        description: "your last name",
    })
    public lastName: string;

    @Parameter({
        description: "your email address",
        pattern: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
    })
    public email: string;

    @Parameter({
        description: "your username",
        validInput: "Domain username in the following format: domain\\usernmae",
    })
    public domainUsername: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {

        // check if the member hasn't been onboarded already?
        // TODO in future...

        // if NOT, then call Gluon to onboard him
        // axios.post(...)
        return axios.post(`${QMConfig.subatomic.gluon.baseUrl}/members`,
            {
                firstName: this.firstName,
                lastName: this.lastName,
                email: this.email,
                domainUsername: this.domainUsername,
                slack: {
                    screenName: this.screenName,
                    userId: this.userId,
                },
            })
            .then(() => {
                // if successful, then send him a message to welcome him to Subatomic
                // present a message full of helpful messages (in future)
                // then ask him if he'f like to apply to be invited onto existing teams?
                // present with menu list of existing teams
                // on selection, send a invitation request to the selected team
                const text: string = `
Welcome to the Subatomic environment *${this.firstName}*!
Next steps are to either join an existing team or create a new one.
                `;

                const msg: SlackMessage = {
                    text,
                    attachments: [{
                        fallback: "Welcome to the Subatomic environment",
                        footer: `For more information, please read the ${this.docs()}`, // TODO use actual icon
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
                };

                return ctx.messageClient.addressUsers(msg, this.userId);
            })
            .catch(err => failure(err));
    }

    private docs(): string {
        return `${url("https://subatomic.bison.absa.co.za/docs/members#joinTeam",
            "documentation")}`;
    }
}
