import {
    HandleCommand,
    HandlerContext,
    logger,
} from "@atomist/automation-client";
import * as _ from "lodash";
import * as graphql from "../../../typings/types";
import {QMMember} from "../member/Members";
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

export async function loadChannelIdByChannelName(ctx: HandlerContext, name: string): Promise<string> {
    try {
        const result = await ctx.graphClient.query<graphql.ChatChannel.Query, graphql.ChatChannel.Variables>({
            name: "ChatChannel",
            variables: {name},
        });

        if (result) {
            if (result.ChatChannel && result.ChatChannel.length > 0) {
                return result.ChatChannel[0].channelId;
            }
        }
    } catch (error) {
        logger.error("Error occurred running GraphQL query: %s", error);
    }
    return null;
}

export function getDevOpsEnvironmentDetailsProd(teamName): DevOpsEnvironmentDetails {
    return getDevOpsEnvironmentDetails(teamName, "-prod");
}

export function getDevOpsEnvironmentDetails(teamName, subfix: string = ""): DevOpsEnvironmentDetails {
    return {
        openshiftProjectId: `${_.kebabCase(teamName).toLowerCase()}-devops${subfix}`,
        name: `${teamName} DevOps`,
        description: `DevOps environment for ${teamName} [managed by Subatomic]`,
    };
}

export interface DevOpsEnvironmentDetails {
    openshiftProjectId: string;
    name: string;
    description: string;
}

export function createQMTeam(name: string = null,
                             owners: QMMember[] = [],
                             members: QMMember[] = []): QMTeam {
    return {
        name,
        owners,
        members,
    };
}

export interface QMTeam {
    name: string;
    owners: QMMember[];
    members: QMMember[];
}
