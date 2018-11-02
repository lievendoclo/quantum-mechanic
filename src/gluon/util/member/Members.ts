import {HandlerContext, logger} from "@atomist/automation-client";
import * as _ from "lodash";
import * as graphql from "../../../typings/types";

export function userFromDomainUser(domainUsername: string): string {
    return /[^\\]*$/.exec(domainUsername)[0];
}

export function getScreenName(screenName: string) {
    let result = screenName;
    if (screenName.startsWith("<@")) {
        result = _.replace(screenName, /(<@)|>/g, "");
    }
    return result.trim();
}

export async function loadScreenNameByUserId(ctx: HandlerContext, userId: string): Promise<string> {
    try {
        const result = await ctx.graphClient.query<graphql.ChatId.Query, graphql.ChatId.Variables>({
            name: "ChatId",
            variables: {userId},
        });

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

export interface QMMemberBase {
    memberId: string;
    domainUsername: string;
}

export enum MemberRole {
    owner = "Owner",
    member = "Member",
}
