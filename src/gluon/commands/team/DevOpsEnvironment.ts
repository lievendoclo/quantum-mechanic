import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    success,
    Tags,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {MemberService} from "../../util/member/Members";
import {isSuccessCode} from "../../util/shared/Http";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/shared/RecursiveParameterRequestCommand";
import {menuForTeams, TeamService} from "../../util/team/TeamService";

@CommandHandler("Check whether to create a new OpenShift DevOps environment or use an existing one", QMConfig.subatomic.commandPrefix + " request devops environment")
@Tags("subatomic", "slack", "team", "openshift", "devops")
export class NewDevOpsEnvironment extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        description: "team name",
    })
    public teamName: string;

    constructor(private teamService = new TeamService(),
                private memberService = new MemberService()) {
        super();
    }

    protected runCommand(ctx: HandlerContext) {
        return this.requestDevOpsEnvironment(
            ctx,
            this.screenName,
            this.teamName,
            this.teamChannel,
        );
    }

    protected async setNextParameter(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
            try {
                const team = await this.teamService.gluonTeamForSlackTeamChannel(this.teamChannel);
                this.teamName = team.name;
                return await this.handle(ctx);
            } catch (slackChannelError) {
                const teams = await this.teamService.gluonTeamsWhoSlackScreenNameBelongsTo(this.screenName);
                return await menuForTeams(
                    ctx,
                    teams,
                    this,
                    "Please select a team you would like to create a DevOps environment for");
            }
        }
    }

    private async requestDevOpsEnvironment(ctx: HandlerContext, screenName: string,
                                           teamName: string,
                                           teamChannel: string): Promise<any> {

        await ctx.messageClient.addressChannels({
            text: `Requesting DevOps environment for *${teamName}* team.`,
        }, teamChannel);

        const member = await this.memberService.gluonMemberFromScreenName(screenName);

        const teamQueryResult = await this.getGluonTeamFromTeamName(teamName);

        if (!isSuccessCode(teamQueryResult.status)) {
            logger.error(`Could not find gluon team ${teamName}. This should only happen if the gluon server connection dropped.`);
            return ctx.messageClient.respond(`❗Unable to find team with name ${teamName}.`);
        }

        const team = teamQueryResult.data._embedded.teamResources[0];
        logger.info("Requesting DevOps environment for team: " + teamName);

        const teamUpdateResult = await this.requestDevOpsEnvironmentThroughGluon(team.teamId, member.memberId);

        if (!isSuccessCode(teamUpdateResult.status)) {
            logger.error(`Unable to request ${teamName} devops environment. Error: ${JSON.stringify(teamUpdateResult)}`);
            return await ctx.messageClient.respond(`❗Unable to request devops environment for ${teamName}.`);
        }

        return await success();
    }

    private async getGluonTeamFromTeamName(teamName: string) {
        return await this.teamService.gluonTeamByName(teamName);
    }

    private async requestDevOpsEnvironmentThroughGluon(teamId: string, memberId: string) {
        return await this.teamService.requestDevOpsEnvironment(teamId, memberId);
    }

}
