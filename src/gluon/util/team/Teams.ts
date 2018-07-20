import {HandleCommand, HandlerContext} from "@atomist/automation-client";
import {createMenu} from "../shared/GenericMenu";

export function menuForTeams(ctx: HandlerContext, teams: any[],
                             command: HandleCommand, message: string = "Please select a team",
                             projectNameVariable: string = "teamName"): Promise<any> {
    return createMenu(ctx,
        teams.map(team => {
            return {
                value: team.name,
                text: team.name,
            };
        }),
        command,
        message,
        "Select Team",
        projectNameVariable,
    );
}
