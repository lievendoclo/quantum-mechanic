import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
} from "@atomist/automation-client";
import {addressSlackChannelsFromContext} from "@atomist/automation-client/spi/message/MessageClient";
import {QMConfig} from "../../../config/QMConfig";
import {OCCommandResult} from "../../../openshift/base/OCCommandResult";
import {BitbucketConfigurationService} from "../../services/bitbucket/BitbucketConfigurationService";
import {BitbucketService} from "../../services/bitbucket/BitbucketService";
import {GluonService} from "../../services/gluon/GluonService";
import {OCService} from "../../services/openshift/OCService";
import {AddMemberToTeamService} from "../../services/team/AddMemberToTeamService";
import {userFromDomainUser} from "../../util/member/Members";
import {getProjectId} from "../../util/project/Project";
import {
    ChannelMessageClient,
    handleQMError,
    OCResultError,
    QMError,
} from "../../util/shared/Error";
import {getDevOpsEnvironmentDetails} from "../../util/team/Teams";

@EventHandler("Receive MembersAddedToTeamEvent events", `
subscription MembersAddedToTeamEvent {
  MembersAddedToTeamEvent {
    team {
      teamId
      name
      slackIdentity {
        teamChannel
      }
    }
    owners{
      firstName
      slackIdentity {
        screenName
        userId
      }
    }
    members{
      firstName
      domainUsername
      slackIdentity {
        screenName
        userId
      }
    }
  }
}
`)
export class MembersAddedToTeam implements HandleEvent<any> {

    constructor(private gluonService = new GluonService(),
                private addMemberToTeamService = new AddMemberToTeamService(),
                private bitbucketService = new BitbucketService(),
                private ocService = new OCService()) {
    }

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested MembersAddedToTeamEvent event: ${JSON.stringify(event.data)}`);

        const membersAddedToTeamEvent = event.data.MembersAddedToTeamEvent[0];

        try {
            await this.inviteMembersToChannel(ctx, membersAddedToTeamEvent);

            const team = membersAddedToTeamEvent.team;

            const projects = await this.getListOfTeamProjects(team.name);

            await this.addPermissionsForUserToTeams(team.name, projects, membersAddedToTeamEvent);

            const destination = await addressSlackChannelsFromContext(ctx, team.slackIdentity.teamChannel);
            return await ctx.messageClient.send("New user permissions successfully added to associated projects.", destination);
        } catch (error) {
            return await this.handleError(ctx, error, membersAddedToTeamEvent.team.slackIdentity.teamChannel);
        }
    }

    private async getListOfTeamProjects(teamName: string) {
        let projects;
        try {
            projects = await this.gluonService.projects.gluonProjectsWhichBelongToGluonTeam(teamName, false);
        } catch (error) {
            throw new QMError(error, "Failed to get list of projects associated with this team.");
        }
        return projects;
    }

    private async inviteMembersToChannel(ctx: HandlerContext, addMembersToTeamEvent) {

        for (const member of addMembersToTeamEvent.members) {
            await this.addMemberToTeamService.inviteUserToSlackChannel(
                ctx,
                member.firstName,
                addMembersToTeamEvent.team.name,
                addMembersToTeamEvent.team.slackIdentity.teamChannel,
                member.slackIdentity.userId,
                member.slackIdentity.screenName);
        }

        for (const owner of addMembersToTeamEvent.owners) {
            await this.addMemberToTeamService.inviteUserToSlackChannel(
                ctx,
                owner.firstName,
                addMembersToTeamEvent.team.name,
                addMembersToTeamEvent.team.slackIdentity.teamChannel,
                owner.slackIdentity.userId,
                owner.slackIdentity.screenName);
        }
    }

    private async addPermissionsForUserToTeams(teamName: string, projects, membersAddedToTeamEvent) {
        try {
            const bitbucketConfiguration = new BitbucketConfigurationService(this.bitbucketService);
            await this.ocService.login();
            const devopsProject = getDevOpsEnvironmentDetails(teamName).openshiftProjectId;
            await this.ocService.addTeamMembershipPermissionsToProject(devopsProject, membersAddedToTeamEvent);
            for (const project of projects) {
                logger.info(`Configuring permissions for project: ${project}`);
                // Add to bitbucket
                await bitbucketConfiguration.addAllMembersToProject(
                    project.bitbucketProject.key,
                    membersAddedToTeamEvent.members.map(member => userFromDomainUser(member.domainUsername)));
                await bitbucketConfiguration.addAllOwnersToProject(
                    project.bitbucketProject.key,
                    membersAddedToTeamEvent.owners.map(owner => userFromDomainUser(owner.domainUsername)),
                );
                // Add to openshift environments
                for (const environment of QMConfig.subatomic.openshiftNonProd.defaultEnvironments) {
                    const tenant = await this.gluonService.tenants.gluonTenantFromTenantId(project.owningTenant);
                    const projectId = getProjectId(tenant.name, project.name, environment.id);
                    await this.ocService.addTeamMembershipPermissionsToProject(projectId, membersAddedToTeamEvent);
                }
            }
        } catch (error) {
            if (error instanceof OCCommandResult) {
                throw new OCResultError(error, `Failed to add openshift team member permissions to the team projects.`);
            }
            throw error;
        }
    }

    private async handleError(ctx: HandlerContext, error, teamChannel: string) {
        const messageClient = new ChannelMessageClient(ctx);
        messageClient.addDestination(teamChannel);
        return await handleQMError(messageClient, error);
    }
}
