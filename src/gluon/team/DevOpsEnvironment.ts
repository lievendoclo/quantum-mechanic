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
import * as config from "config";
import * as _ from "lodash";
import {gluonMemberFromScreenName} from "../member/Members";

@CommandHandler("Check whether to create a new OpenShift DevOps environment or use and existing one", config.get("subatomic").commandPrefix + " request devops environment")
@Tags("subatomic", "slack", "team", "openshift", "devops")
export class NewDevOpsEnvironment implements HandleCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackTeam)
    public teamId: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "team name",
        displayable: false,
    })
    public teamName: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Creating new DevOps environment for ...`);

        // If teamId is null (i.e. this command is not run from a team channel)
        // -> Present a list of Teams to create the DevOps environment for
        // then circle back with one selected and param = teamName;
        // if member only belongs to one team then just continue...

        return gluonMemberFromScreenName(ctx, this.screenName)
            .then(member => {
                return axios.get(`http://localhost:8080/teams?name=${this.teamName}`)
                    .then(team => {
                        if (!_.isEmpty(team.data._embedded)) {
                            return axios.put(`http://localhost:8080/teams/${team.data._embedded.teamResources[0].teamId}`,
                                {
                                    devOpsEnvironment: {
                                        requestedBy: member.memberId,
                                    },
                                });
                        }
                    });
            })
            .then(() => {
                return ctx.messageClient.addressChannels({
                    text: "🚀 Your team's DevOps environment is being provisioned...",
                }, this.teamChannel);
            });
    }
}
