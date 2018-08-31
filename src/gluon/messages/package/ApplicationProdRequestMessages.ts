import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import {QMConfig} from "../../../config/QMConfig";
import {CreateApplicationProd} from "../../commands/packages/CreateApplicationProd";
import {ApprovalEnum} from "../../util/shared/ApprovalEnum";

export class ApplicationProdRequestMessages {
    public confirmProdRequest(prodRequestCommand: CreateApplicationProd): SlackMessage {

        const text: string = `By clicking Approve below you confirm that you sign off on the above resources being moved to production. Your user will be logged at the approver for this change.`;

        return {
            text,
            attachments: [{
                fallback: "Please confirm that the above resources should be moved to Prod",
                footer: `For more information, please read the ${this.docs()}`,
                thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/subatomic-logo-colour.png",
                actions: [
                    buttonForCommand(
                        {
                            text: "Approve Prod Request",
                            style: "primary",
                        },
                        prodRequestCommand,
                        {
                            approval: ApprovalEnum.APPROVED,
                        }),
                    buttonForCommand(
                        {
                            text: "Cancel Prod Request",
                        },
                        prodRequestCommand,
                        {
                            approval: ApprovalEnum.REJECTED,
                        }),
                ],
            }],
        };
    }

    public docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/`,
            "documentation")}`;
    }

}
