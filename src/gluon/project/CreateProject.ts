import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import {menuForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {gluonMemberFromScreenName} from "../member/Members";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsToo,
} from "../team/Teams";

@CommandHandler("Create a new project", QMConfig.subatomic.commandPrefix + " create project")
export class CreateProject implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "project name",
    })
    public name: string;

    @Parameter({
        description: "project description",
    })
    public description: string;

    @Parameter({
        description: "team name",
        required: false,
        displayable: false,
    })
    public teamName: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        return gluonTeamForSlackTeamChannel(this.teamChannel)
            .then(team => {
                return this.requestNewProject(
                    ctx,
                    this.screenName,
                    team.name,
                    team.slack.teamChannel,
                );
            }, () => {
                if (!_.isEmpty(this.teamName)) {
                    return this.requestNewProject(
                        ctx,
                        this.screenName,
                        this.teamName,
                        this.teamChannel,
                    );
                } else {
                    return gluonTeamsWhoSlackScreenNameBelongsToo(ctx, this.screenName)
                        .then(teams => {
                            return ctx.messageClient.respond({
                                text: "Please select a team you would like to associate this project with",
                                attachments: [{
                                    fallback: "Select a team to associate this new project with",
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
                                            this, "teamName",
                                            {
                                                name: this.name,
                                                description: this.description,
                                            }),
                                    ],
                                }],
                            });
                        });
                }
            });
    }

    private requestNewProject(ctx: HandlerContext, screenName: string,
                              teamName: string,
                              teamChannel: string): Promise<any> {
        return gluonMemberFromScreenName(ctx, screenName)
            .then(member => {
                axios.get(`${QMConfig.subatomic.gluon.baseUrl}/teams?name=${teamName}`)
                    .then(team => {
                        if (!_.isEmpty(team.data._embedded)) {
                            return axios.post(`${QMConfig.subatomic.gluon.baseUrl}/projects`,
                                {
                                    name: this.name,
                                    description: this.description,
                                    createdBy: member.memberId,
                                    teams: [{
                                        teamId: team.data._embedded.teamResources[0].teamId,
                                    }],
                                });
                        }
                    });
            });
    }
}
