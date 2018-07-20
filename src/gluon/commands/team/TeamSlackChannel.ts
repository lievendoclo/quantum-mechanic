import {
    CommandHandler,
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
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {TeamSlackChannelService} from "../../services/team/TeamSlackChannelService";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/shared/RecursiveParameterRequestCommand";
import {menuForTeams} from "../../util/team/Teams";

@CommandHandler("Check whether to create a new team channel or use an existing channel")
@Tags("subatomic", "slack", "channel", "team")
export class NewOrUseTeamSlackChannel implements HandleCommand {

    @Parameter({
        description: "team name",
    })
    public teamName: string;

    @Parameter({
        description: "team channel name",
        required: false,
    })
    public teamChannel: string;

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        const text: string = `\
Would you like to create a new team channel called *${this.teamChannel}* or \
if you have an existing channel you'd like to use for team wide messages, \
rather use that instead?\
        `;
        const msg: SlackMessage = {
            text,
            attachments: [{
                fallback: `Do you want to create a new team channel (${this.teamChannel}) or link an existing one?`,
                footer: `For more information, please read the ${this.docs()}`,
                actions: [
                    buttonForCommand(
                        {text: `Create channel ${this.teamChannel}`},
                        new NewTeamSlackChannel(),
                        {
                            teamId: ctx.teamId,
                            teamName: this.teamName,
                            teamChannel: this.teamChannel,
                        }),
                    buttonForCommand(
                        {text: "Use an existing channel"},
                        new LinkExistingTeamSlackChannel(),
                        {
                            teamId: ctx.teamId,
                            teamName: this.teamName,
                        }),
                ],
            }],
        };
        return await ctx.messageClient.respond(msg);
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/user-guide/create-a-team#associate-a-slack-channel`,
            "documentation")}`;
    }
}

@CommandHandler("Create team channel", QMConfig.subatomic.commandPrefix + " create team channel")
@Tags("subatomic", "slack", "channel", "team")
export class NewTeamSlackChannel implements HandleCommand {

    @MappedParameter(MappedParameters.SlackTeam)
    public teamId: string;

    @Parameter({
        description: "team name",
    })
    public teamName: string;

    @Parameter({
        description: "team channel name",
        required: false,
        displayable: false,
    })
    public teamChannel: string;

    constructor(private teamSlackChannelService = new TeamSlackChannelService()) {
    }

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            this.teamChannel = _.isEmpty(this.teamChannel) ? this.teamName : this.teamChannel;
            return await this.teamSlackChannelService.linkSlackChannelToGluonTeam(ctx, this.teamName, this.teamId, this.teamChannel, this.docs(), true);
        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#create-team-channel`,
            "documentation")}`;
    }

    private async handleError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }
}

@CommandHandler("Link existing team channel", QMConfig.subatomic.commandPrefix + " link team channel")
@Tags("subatomic", "slack", "channel", "team")
export class LinkExistingTeamSlackChannel extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public slackScreenName: string;

    @MappedParameter(MappedParameters.SlackTeam)
    public teamId: string;

    @RecursiveParameter({
        description: "team name",
    })
    public teamName: string;

    @Parameter({
        description: "team channel name",
        required: true,
    })
    public teamChannel: string;

    constructor(private gluonService = new GluonService(),
                private teamSlackChannelService = new TeamSlackChannelService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext) {
        return await this.teamSlackChannelService.linkSlackChannelToGluonTeam(ctx, this.teamName, this.teamId, this.teamChannel, this.docs(), false);
    }

    protected async setNextParameter(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
            const teams = await this.gluonService.teams.gluonTeamsWhoSlackScreenNameBelongsTo(this.slackScreenName);
            return await menuForTeams(
                ctx,
                teams,
                this,
                "Please select the team you would like to link the slack channel to");
        }
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#link-team-channel`,
            "documentation")}`;
    }
}
