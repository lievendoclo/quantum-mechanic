import {
    HandleCommand,
    HandlerContext,
    logger,
} from "@atomist/automation-client";
import {menuForCommand} from "@atomist/automation-client/spi/message/MessageClient";

export function createAndSendMenu(ctx: HandlerContext, menuOptions: Array<{ value: string, text: string }>,
                                  command: HandleCommand, description: string, selectionMessage: string,
                                  resultVariableName: string, thumbUrl: string = ""): Promise<any> {
    const attachment: { [k: string]: any } = createMenuAttachment(menuOptions, command, "", description, selectionMessage, resultVariableName, thumbUrl);
    logger.info(JSON.stringify(menuOptions));
    return ctx.messageClient.respond({
        text: description,
        attachments: [
            attachment,
        ],
    });
}

export function createMenuAttachment(menuOptions: Array<{ value: string, text: string }>,
                                     command: HandleCommand, text: string, fallback: string, selectionMessage: string,
                                     resultVariableName: string, thumbUrl: string = "") {
    const attachment: { [k: string]: any } = {
        text,
        fallback,
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
    return attachment;
}
