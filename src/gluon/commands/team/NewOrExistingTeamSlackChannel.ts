import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    Parameter,
    Tags,
} from "@atomist/automation-client";
import {TeamSlackChannelMessages} from "../../messages/team/TeamSlackChannelMessages";

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

    public teamSlackChannelMessages = new TeamSlackChannelMessages();

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        return await ctx.messageClient.respond(this.teamSlackChannelMessages.createNewOrUseExistingSlackChannel(this.teamChannel, this.teamName, ctx.workspaceId));
    }
}
