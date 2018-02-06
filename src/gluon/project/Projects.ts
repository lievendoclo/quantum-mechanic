import {HandlerContext} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import axios from "axios";
import * as _ from "lodash";
import {CreateProject} from "./CreateProject";

export function projectFromProjectName(ctx: HandlerContext,
                                       projectName: string,
                                       message: string = "This command requires an existing project"): Promise<any> {
    return axios.get(`http://localhost:8080/projects?name=${projectName}`)
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
                        footer: `For more information, please read the ${url("https://subatomic.bison.absa.co.za/docs/projects",
                            "documentation")}`, // TODO use actual icon
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
