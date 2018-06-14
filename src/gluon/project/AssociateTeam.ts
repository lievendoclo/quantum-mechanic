import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {gluonMemberFromScreenName} from "../member/Members";
import {logErrorAndReturnSuccess} from "../shared/Error";
import {RecursiveParameter, RecursiveParameterRequestCommand} from "../shared/RecursiveParameterRequestCommand";
import {gluonTeamsWhoSlackScreenNameBelongsTo, menuForTeams} from "../team/Teams";
import {gluonProjectFromProjectName, gluonProjects, menuForProjects} from "./Projects";

@CommandHandler("Add additional team/s to a project", QMConfig.subatomic.commandPrefix + " associate team")
export class AssociateTeam extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        description: "team name",
        required: false,
        displayable: false,
    })
    public teamName: string;

    @RecursiveParameter({
        description: "project name",
        required: false,
        displayable: false,
    })
    public projectName: string;

    @Parameter({
        description: "project description",
        required: false,
        displayable: false,
    })
    public projectDescription: string;

    public constructor(projectName: string, projectDescription: string) {
        super();
        this.projectName = projectName;
        this.projectDescription = projectDescription;
    }

    protected runCommand(ctx: HandlerContext) {
        return gluonProjectFromProjectName(ctx, this.projectName)
            .then(() => {
            return this.linkProjectForTeam(ctx, this.screenName, this.teamName);
        });
    }

    protected setNextParameter(ctx: HandlerContext): Promise<HandlerResult> | void {
        if (_.isEmpty(this.projectName)) {
            return gluonProjects(ctx).then(projects => {
                return menuForProjects(
                    ctx,
                    projects,
                    this,
                    `Please select a project you would like to associate this team to.`,
                );
            }).catch(error => {
                logErrorAndReturnSuccess(gluonProjects.name, error);
            });
        }
        if (_.isEmpty(this.teamName)) {
            return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName).then(teams => {
                return menuForTeams(
                    ctx,
                    teams,
                    this,
                    `Please select a team you would like to associate to *${this.projectName}*.`,
                );
            }).catch(error => {
                logErrorAndReturnSuccess(gluonTeamsWhoSlackScreenNameBelongsTo.name, error);
            });
        }
    }

    private linkProjectForTeam(ctx: HandlerContext, screenName: string,
                               teamName: string): Promise<any> {
        return gluonMemberFromScreenName(ctx, screenName)
            .then(member => {
                axios.get(`${QMConfig.subatomic.gluon.baseUrl}/teams?name=${teamName}`)
                    .then(team => {
                        if (!_.isEmpty(team.data._embedded)) {
                            return gluonProjectFromProjectName(ctx, this.projectName)
                                .then(gluonProject => {
                                    return axios.put(`${QMConfig.subatomic.gluon.baseUrl}/projects/${gluonProject.projectId}`,
                                        {
                                            productId: gluonProject.projectId,
                                            createdBy: gluonProject.createdBy,
                                            teams: [{
                                                teamId: team.data._embedded.teamResources[0].teamId,
                                                name: team.data._embedded.teamResources[0].name,
                                            }],
                                        }).then( () => {
                                            if (this.teamChannel !== team.data._embedded.teamResources[0].name) {
                                                return ctx.messageClient.respond(`Team *${team.data._embedded.teamResources[0].name}* has been successfully associated with ${gluonProject.projectId}`);
                                            }
                                    })
                                        .catch(error => {
                                            return ctx.messageClient.respond(`❗Failed to link project with error: ${JSON.stringify(error.response.data)}.`);
                                        });
                                }).catch(error => {
                                    return ctx.messageClient.respond(`❗Failed to link project with error: ${JSON.stringify(error.response.data)}`);
                                });
                        }
                    });
            }).catch(error => {
                logErrorAndReturnSuccess(gluonMemberFromScreenName.name, error);
            });
    }
}
