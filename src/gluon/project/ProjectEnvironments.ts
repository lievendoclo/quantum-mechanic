import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    Tags,
} from "@atomist/automation-client";
import axios from "axios";
import {QMConfig} from "../../config/QMConfig";
import {gluonMemberFromScreenName} from "../member/Members";
import {gluonProjectFromProjectName} from "./Projects";

@CommandHandler("Create new OpenShift environments for a project", QMConfig.subatomic.commandPrefix + " request project environments")
@Tags("subatomic", "openshift", "project")
export class NewProjectEnvironments implements HandleCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "project name",
        displayable: false,
    })
    public projectName: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info("Creating new OpenShift environments...");

        return gluonMemberFromScreenName(ctx, this.screenName)
            .then(member => {
                return gluonProjectFromProjectName(ctx, this.projectName)
                    .then(project => {
                        return axios.put(`http://localhost:8080/projects/${project.projectId}`,
                            {
                                projectEnvironment: {
                                    requestedBy: member.memberId,
                                },
                            });
                    })
                    .then(() => {
                        return ctx.messageClient.addressChannels({
                            text: "🚀 Your team's project environment is being provisioned...",
                        }, this.teamChannel);
                    });
            });
    }

}
