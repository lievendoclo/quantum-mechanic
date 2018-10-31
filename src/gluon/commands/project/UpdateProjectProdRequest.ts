import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    Parameter,
} from "@atomist/automation-client";
import {GluonService} from "../../services/gluon/GluonService";
import {ProjectProdRequestApprovalResponse} from "../../util/project/Project";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";

@CommandHandler("Ignore a project prod request")
export class UpdateProjectProdRequest implements HandleCommand<HandlerResult> {

    @Parameter({
        description: "Project production request id",
        required: false,
    })
    public projectProdRequestId: string;

    @Parameter({
        description: "Actioning member id",
        required: false,
    })
    public actioningMemberId: string;

    @Parameter({
        description: "Request message correlation id.",
        required: false,
    })
    public requestCorrelationId: string;

    @Parameter({
        description: "Request response",
        required: false,
    })
    public approvalStatus: ProjectProdRequestApprovalResponse;

    constructor(private gluonService = new GluonService()) {
    }

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`ProdRequestId: ${this.projectProdRequestId}`);
        logger.info(`ActioningMemberId: ${this.actioningMemberId}`);
        logger.info(`RequestCorrelationId: ${this.requestCorrelationId}`);
        logger.info(`ApprovalStatus: ${this.approvalStatus}`);
        try {
            const isProdRequestOpen = await this.isProdRequestOpen();
            if (isProdRequestOpen) {
                await this.updateProdRequest();
                return await this.sendResponseMessage(ctx);
            } else {
                return await this.sendClosedMessage(ctx);
            }
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    private async sendResponseMessage(ctx: HandlerContext) {
        const message = {
            text: `Thank you for your response: *${this.approvalStatus.toString().toUpperCase()}*`,
        };
        return await ctx.messageClient.respond(message, {id: this.requestCorrelationId});
    }

    private async sendClosedMessage(ctx: HandlerContext) {
        const message = {
            text: `The Prod Request has already been closed. Thank you for your response.`,
        };
        return await ctx.messageClient.respond(message, {id: this.requestCorrelationId});
    }

    private async isProdRequestOpen() {
        const prodRequest = await this.gluonService.prod.project.getProjectProdRequestById(this.projectProdRequestId);
        return prodRequest.approvalStatus === "PENDING";
    }

    private async updateProdRequest() {
        if (this.approvalStatus === ProjectProdRequestApprovalResponse.approve) {
            await this.gluonService.prod.project.approveProjectProdRequest(this.projectProdRequestId, this.actioningMemberId);
        } else if (this.approvalStatus === ProjectProdRequestApprovalResponse.reject) {
            await this.gluonService.prod.project.rejectProjectProdRequest(this.projectProdRequestId, this.actioningMemberId);
        }
    }
}
