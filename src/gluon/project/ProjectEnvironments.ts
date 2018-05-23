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
import _ = require("lodash");
import {QMConfig} from "../../config/QMConfig";
import {gluonMemberFromScreenName} from "../member/Members";
import {logErrorAndReturnSuccess} from "../shared/Error";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo, menuForTeams,
} from "../team/Teams";
import {
    gluonProjectFromProjectName,
    gluonProjectsWhichBelongToGluonTeam, menuForProjects,
} from "./Projects";

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
        required: false,
    })
    public projectName: string = null;

    @Parameter({
        description: "team name",
        displayable: false,
        required: false,
    })
    public teamName: string = null;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info("Creating new OpenShift environments...");

        if (_.isEmpty(this.projectName)) {
            return this.requestUnsetParameters(ctx);
        }

        return gluonMemberFromScreenName(ctx, this.screenName)
            .then(member => {
                return gluonProjectFromProjectName(ctx, this.projectName)
                    .then(project => {
                        return axios.put(`${QMConfig.subatomic.gluon.baseUrl}/projects/${project.projectId}`,
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
                    }).catch(error => {
                        logErrorAndReturnSuccess(gluonProjectFromProjectName.name, error);
                    });
            }).catch(error => {
                logErrorAndReturnSuccess(gluonMemberFromScreenName.name, error);
            });
    }

    private requestUnsetParameters(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
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
                                "Please select a team associated with the project you wish to provision the environments for",
                            );
                        }).catch(error => {
                            logErrorAndReturnSuccess(gluonTeamsWhoSlackScreenNameBelongsTo.name, error);
                        });
                    },
                );
        }
        if (_.isEmpty(this.projectName)) {
            return gluonProjectsWhichBelongToGluonTeam(ctx, this.teamName)
                .then(projects => {
                    return menuForProjects(
                        ctx,
                        projects,
                        this,
                        "Please select the projects you wish to provision the environments for",
                    );
                }).catch(error => {
                    logErrorAndReturnSuccess(gluonProjectsWhichBelongToGluonTeam.name, error);
                });
        }
    }

}
