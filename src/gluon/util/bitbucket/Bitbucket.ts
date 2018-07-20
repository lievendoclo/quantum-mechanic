import {HandleCommand, HandlerContext} from "@atomist/automation-client";
import {createMenu} from "../shared/GenericMenu";

export function menuForBitbucketRepositories(ctx: HandlerContext, bitbucketRepositories: any[],
                                             command: HandleCommand, message: string = "Please select a Bitbucket repository",
                                             bitbucketProjectNameVariable: string = "bitbucketRepositoryName",
                                             thumbUrl = ""): Promise<any> {
    return createMenu(ctx,
        bitbucketRepositories.map(bitbucketRepository => {
            return {
                value: bitbucketRepository.name,
                text: bitbucketRepository.name,
            };
        }),
        command,
        message,
        "Select Bitbucket Repo",
        bitbucketProjectNameVariable,
        thumbUrl,
    );
}
