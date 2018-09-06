import {logger} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {AwaitAxios} from "../../../http/AwaitAxios";
import {isSuccessCode} from "../../../http/Http";
import {CreateApplication} from "../../commands/packages/CreateApplication";
import {QMError} from "../../util/shared/Error";

export class ApplicationService {

    constructor(public axiosInstance = new AwaitAxios()) {
    }

    public async gluonApplicationsLinkedToGluonProject(gluonProjectName: string, requestActionOnFailure: boolean = true): Promise<any> {
        logger.debug(`Trying to get gluon applications associated to projectName. gluonProjectName: ${gluonProjectName} `);

        const result = await this.axiosInstance.get(`${QMConfig.subatomic.gluon.baseUrl}/applications?projectName=${gluonProjectName}`);

        if (!isSuccessCode(result.status)) {
            throw new QMError(`Failed to get applications linked to project ${gluonProjectName}`);
        }

        let returnValue = [];

        if (!_.isEmpty(result.data._embedded)) {
            returnValue = result.data._embedded.applicationResources;
        } else if (requestActionOnFailure) {
            const slackMessage: SlackMessage = {
                text: "Unfortunately there are no applications linked to this project.",
                attachments: [{
                    text: "Would you like to create a new application?",
                    fallback: "Would you like to create a new application?",
                    actions: [
                        buttonForCommand(
                            {
                                text: "Create application",
                            },
                            new CreateApplication()),
                    ],
                }],
            };

            throw new QMError(`No applications linked to project ${gluonProjectName}.`, slackMessage);
        }

        return returnValue;

    }

    public async gluonApplicationForNameAndProjectName(applicationName: string,
                                                       projectName: string,
                                                       requestActionOnFailure: boolean = true): Promise<any> {
        logger.debug(`Trying to get gluon applications associated to name and project. applicationName: ${applicationName}; projectName: ${projectName}`);

        const result = await this.axiosInstance.get(`${QMConfig.subatomic.gluon.baseUrl}/applications?name=${applicationName}&projectName=${projectName}`);

        if (!isSuccessCode(result.status) || _.isEmpty(result.data._embedded)) {
            const errorMessage = `Application with name ${applicationName} in project ${projectName} does not exist`;
            if (requestActionOnFailure) {
                const slackMessage: SlackMessage = {
                    text: "This command requires an existing application",
                    attachments: [{
                        text: `
Unfortunately Subatomic does not manage this application.
Consider creating a new application called ${applicationName}. Click the button below to do that now.
                            `,
                        fallback: "Application not managed by Subatomic",
                        footer: `For more information, please read the ${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#create-bitbucket-project`,
                            "documentation")}`,
                        color: "#ffcc00",
                        mrkdwn_in: ["text"],
                        actions: [
                            buttonForCommand(
                                {
                                    text: "Create application",
                                },
                                new CreateApplication(), {
                                    name: applicationName,
                                }),
                        ],
                    }],
                };

                throw new QMError(errorMessage, slackMessage);
            } else {
                throw new QMError(errorMessage);
            }
        }

        return result.data._embedded.applicationResources[0];
    }

    public gluonApplicationsLinkedToGluonProjectId(gluonProjectId: string): Promise<any[]> {
        logger.debug(`Trying to get gluon applications associated to project Id. gluonProjectId: ${gluonProjectId} `);
        return this.axiosInstance.get(`${QMConfig.subatomic.gluon.baseUrl}/applications?projectId=${gluonProjectId}`)
            .then(applications => {
                if (!_.isEmpty(applications.data._embedded)) {
                    return Promise.resolve(applications.data._embedded.applicationResources);
                }
                return [];
            });
    }

    public async createGluonApplication(applicationDetails: any): Promise<any> {
        logger.debug(`Trying to create application.`);
        return await this.axiosInstance.post(`${QMConfig.subatomic.gluon.baseUrl}/applications`, applicationDetails);
    }

}
