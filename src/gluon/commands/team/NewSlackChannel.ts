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
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {TeamSlackChannelService} from "../../services/team/TeamSlackChannelService";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";

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
            return await this.teamSlackChannelService.linkSlackChannelToGluonTeam(ctx, this.teamName, this.teamId, this.teamChannel, "create-team-channel", true);
        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    private async handleError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }
}
