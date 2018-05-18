import {
    CommandHandler,
    failure,
    HandleCommand,
    HandlerContext,
    HandlerResult, logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    success,
} from "@atomist/automation-client";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {gluonMemberFromScreenName} from "../member/Members";
import {
    gluonProjectFromProjectName,
    gluonProjectsWhichBelongToGluonTeam, menuForProjects,
} from "../project/Projects";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo, menuForTeams,
} from "../team/Teams";
import {bitbucketAxios} from "./Bitbucket";

@CommandHandler("Create a new Bitbucket project", QMConfig.subatomic.commandPrefix + " create bitbucket project")
export class NewBitbucketProject implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "bitbucket project key",
    })
    public bitbucketProjectKey: string;

    @Parameter({
        description: "project name",
        displayable: false,
        required: false,
    })
    public projectName: string;

    @Parameter({
        description: "team name",
        displayable: false,
        required: false,
    })
    public teamName: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {

        if (_.isEmpty(this.projectName)) {
            return this.requestUnsetParameters(ctx);
        }

        logger.info(`Team: ${this.teamName}, Project: ${this.projectName}`);
        // get memberId for createdBy
        return gluonMemberFromScreenName(ctx, this.screenName)
            .then(member => {

                // get project by project name
                return gluonProjectFromProjectName(ctx, this.projectName)
                    .then(project => {
                        // update project by creating new Bitbucket project (new domain concept)
                        axios.put(`${QMConfig.subatomic.gluon.baseUrl}/projects/${project.projectId}`,
                            {
                                bitbucketProject: {
                                    name: this.projectName,
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

    private requestUnsetParameters(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
            logger.info("Team name is empty");
            return gluonTeamForSlackTeamChannel(this.teamChannel)
                .then(
                    team => {
                        this.teamName = team.name;
                        return this.requestUnsetParameters(ctx);
                    },
                    () => {
                        return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName).then(teams => {
                            return menuForTeams(
                                ctx,
                                teams,
                                this,
                                "Please select a team associated with the project you wish to create a Bitbucket project for",
                            );
                        });
                    },
                );
        }
        if (_.isEmpty(this.projectName)) {
            logger.info("Project name is empty");
            return gluonProjectsWhichBelongToGluonTeam(ctx, this.teamName)
                .then(projects => {
                    return menuForProjects(
                        ctx,
                        projects,
                        this,
                        "Please select the project you wish to create a Bitbucket project for",
                    );
                });
        }

        logger.info("Nothing was empty");
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
        description: "bitbucket project key",
    })
    public bitbucketProjectKey: string;

    @Parameter({
        description: "project name",
        displayable: false,
        required: false,
    })
    public projectName: string;

    @Parameter({
        description: "team name",
        displayable: false,
        required: false,
    })
    public teamName: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {

        if (_.isEmpty(this.projectName)) {
            return this.requestUnsetParameters(ctx);
        }

        logger.info(`Team: ${this.teamName}, Project: ${this.projectName}`);

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

    private requestUnsetParameters(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
            logger.info("Team name is empty");
            return gluonTeamForSlackTeamChannel(this.teamChannel)
                .then(
                    team => {
                        this.teamName = team.name;
                        return this.requestUnsetParameters(ctx);
                    },
                    () => {
                        return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName).then(teams => {
                            return menuForTeams(
                                ctx,
                                teams,
                                this,
                                "Please select a team associated with the project you wish to link a Bitbucket project to",
                            );
                        });
                    },
                );
        }
        if (_.isEmpty(this.projectName)) {
            logger.info("Project name is empty");
            return gluonProjectsWhichBelongToGluonTeam(ctx, this.teamName)
                .then(projects => {
                    return menuForProjects(
                        ctx,
                        projects,
                        this,
                        "Please select the project you wish to link a Bitbucket project to",
                    );
                });
        }
        logger.info("Nothing was empty");
    }
}
