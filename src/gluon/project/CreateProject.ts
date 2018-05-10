import {
    CommandHandler, failure,
    HandleCommand,
    HandlerContext,
    HandlerResult, logger,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import {menuForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {gluonMemberFromScreenName} from "../member/Members";
import {gluonTenantFromTenantName, gluonTenantList} from "../shared/Tenant";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo,
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

    @Parameter({
        description: "tenant name",
        required: false,
        displayable: false,
    })
    public tenantName: string = null;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        return gluonTeamForSlackTeamChannel(this.teamChannel)
            .then(team => {
                return this.requestNewProjectForTeam(
                    ctx,
                    this.screenName,
                    team.name,
                    this.tenantName,
                );
            }, () => {
                if (!_.isEmpty(this.teamName)) {
                    return this.requestNewProjectForTeam(
                        ctx,
                        this.screenName,
                        this.teamName,
                        this.tenantName,
                    );
                } else {
                    return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName)
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
            }).catch(rejectedReason => {
                return ctx.messageClient.respond(`Failed to create project with error: ${JSON.stringify(rejectedReason)}`);
            });
    }

    private requestNewProjectForTeam(ctx: HandlerContext, screenName: string,
                                     teamName: string, tenantName: string): Promise<any> {

        if (tenantName === null) {
            return gluonTenantList().then(tenants => {
                return ctx.messageClient.respond({
                    text: "Please select a tenant you would like to associate this project with. Choose Default if you have no tenant specified for this project.",
                    attachments: [{
                        fallback: "Select a tenant to associate this new project with. Choose Default if you have no tenant specified for this project.",
                        actions: [
                            menuForCommand({
                                    text: "Select Tenant", options:
                                        tenants.map(tenant => {
                                            return {
                                                value: tenant.name,
                                                text: tenant.name,
                                            };
                                        }),
                                },
                                new CreateProject(), "tenantName",
                                {
                                    name: this.name,
                                    description: this.description,
                                    teamName: this.tenantName,
                                }),
                        ],
                    }],
                });
            });
        } else {
            return gluonTenantFromTenantName(tenantName).then(tenant => {
                return this.requestNewProjectForTeamAndTenant(ctx, screenName, teamName, tenant.tenantId);
            });
        }
    }

    private requestNewProjectForTeamAndTenant(ctx: HandlerContext, screenName: string,
                                              teamName: string, tenantId: string): Promise<any> {

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
                                    owningTenant: tenantId,
                                    teams: [{
                                        teamId: team.data._embedded.teamResources[0].teamId,
                                    }],
                                }).catch(error => {
                                if (error.response.status === 409) {
                                    return ctx.messageClient.respond(`❗Failed to create project since the project name is already in use. Please retry using a different project name.`);
                                } else {
                                    return ctx.messageClient.respond(`❗Failed to create project with error: ${JSON.stringify(error.response.data)}`);
                                }
                            });
                        }
                    });
            });
    }
}
