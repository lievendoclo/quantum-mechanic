import {HandleCommand, HandlerContext} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {CreateApplication} from "../../commands/packages/CreateApplication";
import {createMenu} from "../shared/GenericMenu";

export enum ApplicationType {

    DEPLOYABLE = "DEPLOYABLE",
    LIBRARY = "LIBRARY",
}

export class ApplicationService {
    public gluonApplicationsLinkedToGluonProject(ctx: HandlerContext, gluonProjectName: string): Promise<any> {
        return axios.get(`${QMConfig.subatomic.gluon.baseUrl}/applications?projectName=${gluonProjectName}`)
            .then(applications => {
                if (!_.isEmpty(applications.data._embedded)) {
                    return Promise.resolve(applications.data._embedded.applicationResources);
                }

                return ctx.messageClient.respond({
                    text: "Unfortunately there are no applications linked to this project.",
                    attachments: [{
                        text: "Would you like to create a new application?",
                        actions: [
                            buttonForCommand(
                                {
                                    text: "Create application",
                                },
                                new CreateApplication()),
                        ],
                    }],
                })
                    .then(() => Promise.reject(`${gluonProjectName} project does not have any applications linked to it`));
            });
    }

    public gluonApplicationForNameAndProjectName(ctx: HandlerContext,
                                                 applicationName: string,
                                                 projectName: string,
                                                 message: string = "This command requires an existing application"): Promise<any> {
        return axios.get(`${QMConfig.subatomic.gluon.baseUrl}/applications?name=${applicationName}&projectName=${projectName}`)
            .then(applications => {
                if (!_.isEmpty(applications.data._embedded)) {
                    return Promise.resolve(applications.data._embedded.applicationResources[0]);
                } else {
                    const msg: SlackMessage = {
                        text: message,
                        attachments: [{
                            text: `
Unfortunately Subatomic does not manage this project.
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

                    return ctx.messageClient.respond(msg)
                        .then(() => Promise.reject(
                            `Application with name ${applicationName} does not exist`));
                }
            });
    }

    public gluonApplicationsLinkedToGluonProjectId(gluonProjectId: string): Promise<any[]> {
        return axios.get(`${QMConfig.subatomic.gluon.baseUrl}/applications?projectId=${gluonProjectId}`)
            .then(applications => {
                if (!_.isEmpty(applications.data._embedded)) {
                    return Promise.resolve(applications.data._embedded.applicationResources);
                }
                return [];
            });
    }
}

export function menuForApplications(ctx: HandlerContext, applications: any[],
                                    command: HandleCommand, message: string = "Please select an application/library",
                                    applicationNameVariable: string = "applicationName"): Promise<any> {
    return createMenu(ctx,
        applications.map(application => {
            return {
                value: application.name,
                text: application.name,
            };
        }),
        command,
        message,
        "Select Application/Library",
        applicationNameVariable,
    );
}
