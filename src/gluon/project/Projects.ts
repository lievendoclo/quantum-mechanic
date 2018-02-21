import {HandlerContext} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {CreateTeam} from "../team/CreateTeam";
import {CreateProject} from "./CreateProject";

export function gluonProjectFromProjectName(ctx: HandlerContext,
                                            projectName: string,
                                            message: string = "This command requires an existing project"): Promise<any> {
    return axios.get(`${QMConfig.subatomic.gluon.baseUrl}/projects?name=${projectName}`)
        .then(projects => {
            if (!_.isEmpty(projects.data._embedded)) {
                return Promise.resolve(projects.data._embedded.projectResources[0]);
            } else {
                const msg: SlackMessage = {
                    text: message,
                    attachments: [{
                        text: `
Unfortunately Subatomic does not manage this project.
Consider creating a new project called ${projectName}. Click the button below to do that now.
                            `,
                        fallback: "Project not managed by Subatomic",
                        footer: `For more information, please read the ${url(`${QMConfig.subatomic.docs.baseUrl}/projects`,
                            "documentation")}`,
                        color: "#ffcc00",
                        mrkdwn_in: ["text"],
                        actions: [
                            buttonForCommand(
                                {
                                    text: "Create project",
                                },
                                new CreateProject(), {
                                    name: projectName,
                                }),
                        ],
                    }],
                };

                return ctx.messageClient.respond(msg)
                    .then(() => Promise.reject(
                        `Project with name ${projectName} does not exist`));
            }
        });
}

export function gluonProjectsWhichBelongToGluonTeam(ctx: HandlerContext, teamName: string): Promise<any[]> {
    return axios.get(`${QMConfig.subatomic.gluon.baseUrl}/projects?teamName=${teamName}`)
        .then(projects => {
            if (!_.isEmpty(projects.data._embedded)) {
                return Promise.resolve(projects.data._embedded.projectResources);
            }

            return ctx.messageClient.respond({
                text: "Unfortunately there are no projects linked to any of your teams with that name.",
                attachments: [{
                    text: "Would you like to create a new project?",
                    actions: [
                        buttonForCommand(
                            {
                                text: "Create project",
                            },
                            new CreateTeam()),
                    ],
                }],
            })
                .then(() => Promise.reject(`${teamName} team does not have any projects linked to it`));
        });
}
