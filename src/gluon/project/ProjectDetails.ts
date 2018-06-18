import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage} from "@atomist/slack-messages";
import _ = require("lodash");
import {QMConfig} from "../../config/QMConfig";
import {gluonApplicationsLinkedToGluonProjectId} from "../packages/Applications";
import {logErrorAndReturnSuccess} from "../shared/Error";
import {RecursiveParameter, RecursiveParameterRequestCommand} from "../shared/RecursiveParameterRequestCommand";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo,
    menuForTeams,
} from "../team/Teams";
import {gluonProjectsWhichBelongToGluonTeam} from "./Projects";

@CommandHandler("List projects belonging to a team", QMConfig.subatomic.commandPrefix + " list projects")
export class ListTeamProjects extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        description: "team name",
    })
    public teamName: string;

    protected runCommand(ctx: HandlerContext) {
        return this.listTeamProjects(ctx, this.teamName);
    }

    protected setNextParameter(ctx: HandlerContext): Promise<HandlerResult> | void {
        if (_.isEmpty(this.teamName)) {
            return gluonTeamForSlackTeamChannel(this.teamChannel)
                .then(
                    team => {
                        this.teamName = team.name;
                        return this.listTeamProjects(ctx, this.teamName);
                    },
                    () => {
                        return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName).then(teams => {
                            return menuForTeams(
                                ctx,
                                teams,
                                this,
                                "Please select the team you would like to list the projects for",
                            );
                        }).catch(error => {
                            logErrorAndReturnSuccess(gluonTeamForSlackTeamChannel.name, error);
                        });
                    },
                );
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
            }).catch(error => {
                logErrorAndReturnSuccess(gluonProjectsWhichBelongToGluonTeam.name, error);
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

            let headerMessage = `The current details of the project *${this.projectName}* are as follows.\n*Description:* ${this.projectDescription}\n*Bitbucket URL:* ${bitbucketURL}\n`;

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
        }).catch(error => {
            logErrorAndReturnSuccess(gluonApplicationsLinkedToGluonProjectId.name, error);
        });

    }
}
