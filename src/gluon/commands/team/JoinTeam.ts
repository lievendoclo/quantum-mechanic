import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Tags,
} from "@atomist/automation-client";
import {QMConfig} from "../../../config/QMConfig";
import {isSuccessCode} from "../../../http/Http";
import {JoinTeamMessages} from "../../messages/team/JoinTeamMessages";
import {GluonService} from "../../services/gluon/GluonService";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";

@CommandHandler("Apply to join an existing team", QMConfig.subatomic.commandPrefix + " apply to team")
@Tags("subatomic", "team")
export class JoinTeam implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUser)
    public slackName: string;

    public joinTeamMessages: JoinTeamMessages = new JoinTeamMessages();

    constructor(private gluonService = new GluonService()) {
    }

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            const teamsQueryResult = await this.gluonService.teams.getAllTeams();

            if (!isSuccessCode(teamsQueryResult.status)) {
                return ctx.messageClient.respond(this.joinTeamMessages.alertUserThatNoTeamsExist());
            }

            const teams = teamsQueryResult.data._embedded.teamResources;
            logger.info(`Found teams data: ${JSON.stringify(teams)}`);

            // remove teams that he is already a member of - TODO in future

            return ctx.messageClient.respond(this.joinTeamMessages.presentMenuForTeamSelection(this.slackName, teams));
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }
}
