import {
    CommandHandler,
    failure,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
    success,
} from "@atomist/automation-client";
import axios from "axios";
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
        description: "bitbucket project key",
    })
    public bitbucketProjectKey: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        // get memberId for createdBy
        return gluonMemberFromScreenName(ctx, this.screenName)
            .then(member => {
                return gluonProjectFromProjectName(ctx, this.projectName)
                    .then(gluonProject => {
                        return ctx.messageClient.addressChannels({
                            text: `🚀 The Bitbucket project with key ${this.bitbucketProjectKey} is being configured...`,
                        }, this.teamChannel)
                            .then(() => {
                                // get the selected project's details
                                const projectRestUrl = `${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${this.bitbucketProjectKey}`;
                                const projectUiUrl = `${QMConfig.subatomic.bitbucket.baseUrl}/projects/${this.bitbucketProjectKey}`;
                                return bitbucketAxios().get(projectRestUrl)
                                    .then(project => {
                                        return axios.put(`${QMConfig.subatomic.gluon.baseUrl}/projects/${gluonProject.projectId}`,
                                            {
                                                bitbucketProject: {
                                                    bitbucketProjectId: project.data.id,
                                                    name: project.data.name,
                                                    description: project.data.description,
                                                    key: this.bitbucketProjectKey,
                                                    url: projectUiUrl,
                                                },
                                                createdBy: member.memberId,
                                            }).then(success);
                                    })
                                    .catch(error => {
                                        if (error.response && error.response.status === 404) {
                                            return ctx.messageClient.addressChannels({
                                                text: `⚠️ The Bitbucket project with key ${this.bitbucketProjectKey} was not found`,
                                            }, this.teamChannel)
                                                .then(failure);
                                        } else {
                                            return failure(error);
                                        }
                                    });
                            });
                    });
            });
    }
}
