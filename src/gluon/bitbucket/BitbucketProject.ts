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
import * as config from "config";
import {memberFromScreenName} from "../member/Members";
import {projectFromProjectName} from "../project/Projects";

@CommandHandler("Create a new Bitbucket project", config.get("subatomic").commandPrefix + " create bitbucket project")
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
        return memberFromScreenName(ctx, this.screenName)
            .then(member => {

                // get project by project name
                return projectFromProjectName(ctx, this.name)
                    .then(project => {

                        // update project by creating new Bitbucket project (new domain concept)
                        axios.put(`http://localhost:8080/projects/${project.projectId}`,
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
