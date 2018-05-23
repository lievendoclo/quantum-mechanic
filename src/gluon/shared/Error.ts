import {
    HandlerResult,
    logger,
    success} from "@atomist/automation-client";

export function logErrorAndReturnSuccess(method, error): HandlerResult {
    logger.info(`Don't display the error - ${method} already handles it.`);
    logger.error(error);
    return success();
}
