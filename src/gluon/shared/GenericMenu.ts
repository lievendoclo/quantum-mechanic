import {
    HandleCommand, HandlerContext,
    logger,
} from "@atomist/automation-client";
import {menuForCommand} from "@atomist/automation-client/spi/message/MessageClient";

export function createMenu(ctx: HandlerContext, menuOptions: Array<{ value: string, text: string }>,
                           command: HandleCommand, description: string, selectionMessage: string,
                           resultVariableName: string, thumbUrl: string = ""): Promise<any> {
    const attachment: { [k: string]: any } = {
        fallback: description,
        actions: [
            menuForCommand({
                    text: selectionMessage, options:
                    menuOptions,
                },
                command, resultVariableName),
        ],
    };
    if (thumbUrl.length > 0) {
        attachment.thumb_url = thumbUrl;
    }
    logger.info(JSON.stringify(menuOptions));
    return ctx.messageClient.respond({
        text: description,
        attachments: [
            attachment,
        ],
    });
}
