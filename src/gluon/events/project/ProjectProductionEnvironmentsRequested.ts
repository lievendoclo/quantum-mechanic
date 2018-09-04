import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    success,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage} from "@atomist/slack-messages";
import _ = require("lodash");
import {v4 as uuid} from "uuid";
import {UpdateProjectProdRequest} from "../../commands/project/UpdateProjectProdRequest";
import {GluonService} from "../../services/gluon/GluonService";
import {ProjectProdRequestApprovalResponse} from "../../util/project/Project";
import {ChannelMessageClient, handleQMError} from "../../util/shared/Error";

@EventHandler("Receive ProjectProductionEnvironmentsRequestedEvent events", `
subscription ProjectProductionEnvironmentsRequestedEvent {
  ProjectProductionEnvironmentsRequestedEvent {
    id
    projectProdRequestId
  }
}
`)
export class ProjectProductionEnvironmentsRequested implements HandleEvent<any> {

    constructor(public gluonService = new GluonService()) {
    }

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested ProjectProductionEnvironmentsRequestedEvent event: ${JSON.stringify(event.data)}`);

        const environmentsRequestedEvent = event.data.ProjectProductionEnvironmentsRequestedEvent[0];

        logger.info("Trying to find projectProdRequestDetails");

        const projectProdRequest = await this.gluonService.prod.project.getProjectProdRequestById(environmentsRequestedEvent.projectProdRequestId);

        const associatedTeams = await this.gluonService.teams.getTeamsAssociatedToProject(projectProdRequest.project.projectId);

        const qmMessageClient = this.createMessageClient(ctx, associatedTeams);

        try {
            const projectName = projectProdRequest.project.name;

            const project = await this.gluonService.projects.gluonProjectFromProjectName(projectName);

            const membersToMessage = await this.gluonService.members.findMembersAssociatedToTeam(project.owningTeam.teamId);

            for (const teamMember of membersToMessage) {
                const requestCorrelationId: string = uuid();
                await ctx.messageClient.addressUsers({
                    text: `The project *${projectName}* owned by team *${project.owningTeam.name}* has been requested to move into prod. As a member of the team you have please select an option below indicating whether you approve of this request.`,
                }, teamMember.slack.screenName);

                await ctx.messageClient.addressUsers(
                    this.createPersonalisedMessage(teamMember, projectProdRequest.projectProdRequestId, requestCorrelationId),
                    teamMember.slack.screenName,
                    {id: requestCorrelationId},
                );
            }

            await qmMessageClient.send("Successfully created project production request. Approval requests have been sent out.");

            return await success();
        } catch (error) {
            return await handleQMError(qmMessageClient, error);
        }
    }

    private createPersonalisedMessage(teamMember: { memberId: string, name: string, slack: { screenName } },
                                      projectProdRequestId: string,
                                      requestCorrelationId: string): SlackMessage {

        const baseParams: { [k: string]: string } = {
            projectProdRequestId,
            requestCorrelationId,
            actioningMemberId: teamMember.memberId,
        };

        const approvedParams = _.clone(baseParams);
        approvedParams.approvalStatus = ProjectProdRequestApprovalResponse.approve;

        const rejectedParams = _.clone(baseParams);
        rejectedParams.approvalStatus = ProjectProdRequestApprovalResponse.reject;

        const ignoredParams = _.clone(baseParams);
        ignoredParams.approvalStatus = ProjectProdRequestApprovalResponse.ignore;

        return {
            attachments: [
                {
                    text: "By choosing *Approve* you give your sign off that this project can go to prod.",
                    fallback: "Approve",
                    actions: [
                        buttonForCommand({
                                text: "Approve",
                                style: "primary",
                            }, new UpdateProjectProdRequest(),
                            approvedParams),
                    ],
                },
                {
                    text: "By choosing *Reject* you will your cancel this Prod request. A single rejection will cancel this prod request.",
                    fallback: "Reject",
                    actions: [
                        buttonForCommand({
                                text: "Reject",
                                style: "danger",
                            }, new UpdateProjectProdRequest(),
                            rejectedParams),
                    ],
                },
                {
                    text: "By choosing *Ignore* you are giving up your approval rights.",
                    fallback: "Ignore",
                    actions: [
                        buttonForCommand({
                                text: "Ignore",
                            }, new UpdateProjectProdRequest(),
                            ignoredParams),
                    ],
                },
            ],
        };
    }

    private createMessageClient(ctx: HandlerContext,
                                teams: Array<{ slack: { teamChannel: string } }>) {
        const messageClient = new ChannelMessageClient(ctx);
        teams.map(team => {
            messageClient.addDestination(team.slack.teamChannel);
        });
        return messageClient;
    }
}
