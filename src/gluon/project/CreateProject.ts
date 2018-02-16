import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    success,
} from "@atomist/automation-client";
import {menuForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import axios from "axios";
import * as config from "config";
import * as _ from "lodash";
import {gluonMemberFromScreenName} from "../member/Members";
import {teamsWhoScreenNameBelongsToo} from "../team/Teams";

@CommandHandler("Create a new project", config.get("subatomic").commandPrefix + " create project")
export class CreateProject implements HandleCommand<HandlerResult> {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

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
        // ask which team to assign to this project too
        // you must belong to those teams
        if (!_.isEmpty(this.teamName)) {
            return gluonMemberFromScreenName(ctx, this.screenName,
                `There was an error creating your ${this.name} project`)
                .then(member => axios.post("http://localhost:8080/projects",
                    {
                        name: this.name,
                        description: this.description,
                        createdBy: member.memberId,
                        teams: [{
                            teamId: this.teamName,
                        }],
                    }), err => logger.warn(err))
                .then(success);
        } else {
            return teamsWhoScreenNameBelongsToo(ctx, this.screenName)
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
                                                    // TODO use Id when name is actually hinted at by the param
                                                    // may want to clean this up later
                                                    value: team.teamId,
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
                }, err => logger.warn(err));
        }
    }
}
