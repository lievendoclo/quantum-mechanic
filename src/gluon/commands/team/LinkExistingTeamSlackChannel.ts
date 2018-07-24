import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
    Tags,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {TeamSlackChannelService} from "../../services/team/TeamSlackChannelService";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/shared/RecursiveParameterRequestCommand";
import {menuForTeams} from "../../util/team/Teams";

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
        return await this.teamSlackChannelService.linkSlackChannelToGluonTeam(ctx, this.teamName, this.teamId, this.teamChannel, "link-team-channel", false);
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
}
