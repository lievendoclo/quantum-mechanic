import {HandleCommand, HandlerContext} from "@atomist/automation-client";
import {createMenuAttachment} from "../shared/GenericMenu";

export function menuAttachmentForBitbucketRepositories(ctx: HandlerContext, bitbucketRepositories: any[],
                                                       command: HandleCommand, message: string = "Please select a Bitbucket repository",
                                                       bitbucketProjectNameVariable: string = "bitbucketRepositoryName",
                                                       thumbUrl = "") {
    return createMenuAttachment(
        bitbucketRepositories.map(bitbucketRepository => {
            return {
                value: bitbucketRepository.slug,
                text: bitbucketRepository.name,
            };
        }),
        command,
        message,
        message,
        "Select Bitbucket Repo",
        bitbucketProjectNameVariable,
        thumbUrl,
    );
}
