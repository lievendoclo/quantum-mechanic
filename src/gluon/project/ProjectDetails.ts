import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
    success,
} from "@atomist/automation-client";
import {
    buttonForCommand,
    menuForCommand,
} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage} from "@atomist/slack-messages";
import {QMConfig} from "../../config/QMConfig";
import {
    gluonApplicationsLinkedToGluonProject,
    gluonApplicationsLinkedToGluonProjectId,
} from "../packages/Applications";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo,
} from "../team/Teams";
import {
    gluonProjectFromProjectName,
    gluonProjectsWhichBelongToGluonTeam,
} from "./Projects";

@CommandHandler("List projects belonging to a team", QMConfig.subatomic.commandPrefix + " list projects")
export class ListTeamProjects implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "team name",
        required: false,
        displayable: false,
    })
    public teamName: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        if (this.teamName == null) {
            return gluonTeamForSlackTeamChannel(this.teamChannel)
                .then(team => {
                        return this.listTeamProjects(ctx, team.name);
                    }, () => {
                        return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName)
                            .then(teams => {
                                const msg: SlackMessage = {
                                    text: "Please select the team you would like to list the projects for",
                                    attachments: [{
                                        fallback: "A menu",
                                        actions: [
                                            menuForCommand({
                                                    text: "Select Team", options:
                                                        teams.map(team => {
                                                            return {
                                                                value: team.name,
                                                                text: team.name,
                                                            };
                                                        }),
                                                },
                                                this, "teamName"),
                                        ],
                                    }],
                                };
                                return ctx.messageClient.respond(msg)
                                    .then(success);
                            });
                    },
                );
        } else {
            return this.listTeamProjects(ctx, this.teamName);
        }
    }

    private listTeamProjects(ctx: HandlerContext, teamName: string): Promise<HandlerResult> {
        return gluonProjectsWhichBelongToGluonTeam(ctx, teamName)
            .then(projects => {
                const attachments = [];

                for (const project of projects) {

                    const parameters = {
                        projectId: project.projectId,
                        projectName: project.name,
                        projectDescription: project.description,
                        projectBitbucketKey: null,
                    };

                    if (project.bitbucketProject !== null) {
                        parameters.projectBitbucketKey = project.bitbucketProject.key;
                    }

                    attachments.push(
                        {
                            text: `*Project:* ${project.name}\n*Description:* ${project.description}`,
                            color: "#45B254",
                            actions: [
                                buttonForCommand(
                                    {
                                        text: "Show More",
                                    },
                                    new ListProjectDetails(),
                                    parameters,
                                ),
                            ],
                        },
                    );
                }

                const msg: SlackMessage = {
                    text: `The following projects are linked to the team *${teamName}*. Click on the "Show More" button to learn more about a particular project.`,
                    attachments,
                };

                return ctx.messageClient.respond(msg);
            }).catch(() => {
                // Don't display the error - gluonProjectsWhichBelongToGluonTeam already handles it.
                return success();
            });
    }

}

@CommandHandler("List project details")
export class ListProjectDetails implements HandleCommand<HandlerResult> {

    @Parameter({
        description: "project",
        required: false,
        displayable: false,
    })
    public projectId: string;

    @Parameter({
        description: "project",
        required: false,
        displayable: false,
    })
    public projectName: string;

    @Parameter({
        description: "project",
        required: false,
        displayable: false,
    })
    public projectDescription: string;

    @Parameter({
        description: "project",
        required: false,
        displayable: false,
    })
    public projectBitbucketKey: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        return gluonApplicationsLinkedToGluonProjectId(this.projectId).then(applications => {
            let bitbucketURL = "None";
            if (this.projectBitbucketKey !== null) {
                bitbucketURL = `${QMConfig.subatomic.bitbucket.baseUrl}/projects/${this.projectBitbucketKey}`;
            }
            const attachments = [];
            for (const application of applications) {
                let applicationBitbucketUrl = "None";
                if (application.bitbucketRepository !== null) {
                    applicationBitbucketUrl = application.bitbucketRepository.repoUrl;
                }
                attachments.push(
                    {
                        text: `*Application:* ${application.name}\n*Description:* ${application.description}\n*Bitbucket URL:* ${applicationBitbucketUrl}`,
                        color: "#45B254",
                    },
                );
            }

            let headerMessage = `The current details of the project *${this.projectName}* are are as follows.\n*Description:* ${this.projectDescription}\n*Bitbucket URL:* ${bitbucketURL}\n`;

            if (attachments.length > 0) {
                headerMessage += "The below applications belong to the project:";
            } else {
                headerMessage += "There are no applications that belong to this project yet";
            }

            const msg: SlackMessage = {
                text: headerMessage,
                attachments,
            };
            return ctx.messageClient.respond(msg);
        });

    }
}
