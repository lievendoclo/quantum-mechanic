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
import {menuForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import axios from "axios";
import * as config from "config";
import * as _ from "lodash";
import {gluonMemberFromScreenName} from "../member/Members";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsToo,
} from "./Teams";

@CommandHandler("Check whether to create a new OpenShift DevOps environment or use and existing one", config.get("subatomic").commandPrefix + " request devops environment")
@Tags("subatomic", "slack", "team", "openshift", "devops")
export class NewDevOpsEnvironment implements HandleCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "team name",
        displayable: false,
        required: false,
    })
    public teamName: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Creating new DevOps environment for ...`);

        return gluonTeamForSlackTeamChannel(this.teamChannel)
            .then(team => {
                return this.requestDevOpsEnvironment(
                    ctx,
                    this.screenName,
                    team.name,
                    team.slack.teamChannel,
                );
            }, () => {
                if (!_.isEmpty(this.teamName)) {
                    return this.requestDevOpsEnvironment(
                        ctx,
                        this.screenName,
                        this.teamName,
                        this.teamChannel,
                    );
                } else {
                    return gluonTeamsWhoSlackScreenNameBelongsToo(ctx, this.screenName)
                        .then(teams => {
                            if (teams.length === 1) {
                                this.teamName = teams[0].name;
                                return this.handle(ctx);
                            } else {
                                return ctx.messageClient.respond({
                                    text: "Please select a team you would like to create a DevOps environment for",
                                    attachments: [{
                                        fallback: "Select a team to create a DevOps project for",
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
                                                    name: this.teamName,
                                                }),
                                        ],
                                    }],
                                });
                            }
                        });
                }
            });
    }

    private requestDevOpsEnvironment(ctx: HandlerContext, screenName: string,
                                     teamName: string,
                                     teamChannel: string): Promise<any> {
        return gluonMemberFromScreenName(ctx, screenName)
            .then(member => {
                axios.get(`${config.get("subatomic").gluon.baseUrl}/teams?name=${teamName}`)
                    .then(team => {
                        if (!_.isEmpty(team.data._embedded)) {
                            return axios.put(`${config.get("subatomic").gluon.baseUrl}/teams/${team.data._embedded.teamResources[0].teamId}`,
                                {
                                    devOpsEnvironment: {
                                        requestedBy: member.memberId,
                                    },
                                });
                        }
                    })
                    .then(() => {
                        return ctx.messageClient.addressChannels({
                            text: `🚀 Your DevOps environment for *${teamName}* team, is being provisioned...`,
                        }, teamChannel);
                    });
            });
    }
}
