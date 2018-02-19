import {
    CommandHandler,
    failure,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    success,
} from "@atomist/automation-client";
import {menuForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage} from "@atomist/slack-messages";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {gluonMemberFromScreenName} from "../member/Members";
import {gluonProjectFromProjectName} from "../project/Projects";
import {bitbucketAxios} from "./Bitbucket";

@CommandHandler("Create a new Bitbucket project", QMConfig.subatomic.commandPrefix + " create bitbucket project")
export class NewBitbucketProject implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "project name",
    })
    public name: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {

        // get memberId for createdBy
        return gluonMemberFromScreenName(ctx, this.screenName)
            .then(member => {

                // get project by project name
                return gluonProjectFromProjectName(ctx, this.name)
                    .then(project => {
                        // update project by creating new Bitbucket project (new domain concept)
                        axios.put(`${QMConfig.subatomic.gluon.baseUrl}/projects/${project.projectId}`,
                            {
                                bitbucketProject: {
                                    name: this.name,
                                    description: `${project.description} [managed by Subatomic]`,
                                },
                                createdBy: member.memberId,
                            })
                            .then(success);
                    });
            })
            .then(() => {
                return ctx.messageClient.addressChannels({
                    text: "🚀 Your new project is being provisioned...",
                }, this.teamChannel);
            })
            .catch(err => failure(err));
    }
}

@CommandHandler("Link an existing Bitbucket project", QMConfig.subatomic.commandPrefix + " link bitbucket project")
export class ListExistingBitbucketProject implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUser)
    public slackName: string;

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "project name",
    })
    public projectName: string;

    @Parameter({
        description: "bitbucket project name",
        required: false,
    })
    public bitbucketProjectKey: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.bitbucketProjectKey)) {
            // then get a list of projects that the member has access too
            return bitbucketAxios().get(`${QMConfig.subatomic.bitbucket.baseUrl}/api/1.0/projects`)
                .then(projects => {
                    logger.info(`Got Bitbucket projects: ${JSON.stringify(projects.data)}`);

                    const msg: SlackMessage = {
                        text: `Please select the Bitbucket project to link to ${this.projectName}`,
                        attachments: [{
                            fallback: "Link Bitbucket project",
                            actions: [
                                menuForCommand({
                                        text: "Select Team", options:
                                            projects.data.values.map(bitbucketProject => {
                                                return {
                                                    value: bitbucketProject.key,
                                                    text: bitbucketProject.name,
                                                };
                                            }),
                                    },
                                    "ListExistingBitbucketProject", "bitbucketProjectKey",
                                    {projectName: this.projectName}),
                            ],
                        }],
                    };

                    return ctx.messageClient.respond(msg)
                        .then(success);
                });
        } else {
            // get memberId for createdBy
            return gluonMemberFromScreenName(ctx, this.screenName)
                .then(member => {
                    return gluonProjectFromProjectName(ctx, this.projectName)
                        .then(gluonProject => {
                            // get the selected project's details
                            return bitbucketAxios().get(`${QMConfig.subatomic.bitbucket.baseUrl}/api/1.0/projects/${this.bitbucketProjectKey}`)
                                .then(project => {
                                    return axios.put(`${QMConfig.subatomic.gluon.baseUrl}/projects/${gluonProject.projectId}`,
                                        {
                                            bitbucketProject: {
                                                name: project.data.name,
                                                description: project.data.description,
                                            },
                                            createdBy: member.memberId,
                                        });
                                });
                        });
                })
                .then(() => {
                    return ctx.messageClient.addressChannels({
                        text: `🚀 The Bitbucket project with key ${this.bitbucketProjectKey} is being configured...`,
                    }, this.teamChannel);
                });
        }
    }
}
