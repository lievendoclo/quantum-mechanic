import {HandlerContext, logger} from "@atomist/automation-client";
import * as _ from "lodash";
import * as graphql from "../../../typings/types";

export function usernameFromDomainUsername(domainUsername: string): string {
    return /[^\\]*$/.exec(domainUsername)[0];
}

export function getScreenName(screenName: string) {
    let result = screenName;
    if (screenName.startsWith("<@")) {
        result = _.replace(screenName, /(<@)|>/g, "");
    }
    return result;
}

export async function loadScreenNameByUserId(ctx: HandlerContext, userId: string): Promise<string> {
    try {
        const result = await ctx.graphClient.executeQueryFromFile<graphql.ChatId.Query, graphql.ChatId.Variables>(
            "graphql/query/chatIdByUserId",
            {userId});

        if (result) {
            if (result.ChatId && result.ChatId.length > 0) {
                return result.ChatId[0].screenName;
            }
        }
    } catch (error) {
        logger.error("Error occurred running GraphQL query: %s", error);
    }
    return null;
}
