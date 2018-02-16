import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import axios from "axios";
import * as config from "config";
import {gluonMemberFromScreenName} from "../member/Members";
import {gluonProjectFromProjectName} from "../project/Projects";

@CommandHandler("Create a new Bitbucket project", config.get("subatomic").commandPrefix + " create bitbucket project")
export class CreateApplication implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "application name",
    })
    public name: string;

    @Parameter({
        description: "application description",
    })
    public description: string;

    @Parameter({
        description: "project name",
    })
    public projectName: string;

    @Parameter({
        description: "Bitbucket repository name",
    })
    public bitbucketRepositoryName: string;

    @Parameter({
        description: "Bitbucket repository URL",
    })
    public bitbucketRepositoryRepoUrl: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {

        // get memberId for createdBy
        return gluonMemberFromScreenName(ctx, this.screenName)
            .then(member => {

                // get project by project name
                // TODO this should be a drop down for the member to select projects
                // that he is associated with via Teams
                return gluonProjectFromProjectName(ctx, this.projectName)
                    .then(project => {
                        // update project by creating new Bitbucket project (new domain concept)
                        return axios.post(`http://localhost:8080/applications`,
                            {
                                name: this.name,
                                description: this.description,
                                projectId: project.projectId,
                                createdBy: member.memberId,
                            })
                            .then(application => {
                                return axios.put(application.headers.location,
                                    {
                                        projectId: project.projectId,
                                        bitbucketRepository: {
                                            name: this.bitbucketRepositoryName,
                                            repoUrl: this.bitbucketRepositoryRepoUrl,
                                        },
                                        createdBy: member.memberId,
                                    });
                            });
                    });
            })
            .then(() => {
                return ctx.messageClient.addressChannels({
                    text: "🚀 Your new application is being provisioned...",
                }, this.teamChannel);
            });
    }
}
