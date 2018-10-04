import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {OCCommandResult} from "../../../openshift/base/OCCommandResult";
import {BitbucketConfigurationService} from "../../services/bitbucket/BitbucketConfigurationService";
import {BitbucketService} from "../../services/bitbucket/BitbucketService";
import {GluonService} from "../../services/gluon/GluonService";
import {OCService} from "../../services/openshift/OCService";
import {AddMemberToTeamService} from "../../services/team/AddMemberToTeamService";
import {getProjectId} from "../../util/project/Project";
import {
    ChannelMessageClient,
    handleQMError,
    OCResultError,
    QMError,
} from "../../util/shared/Error";
import {getDevOpsEnvironmentDetails} from "../../util/team/Teams";

@EventHandler("Receive MembershipRequestCreated events", `
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

            const bitbucketConfiguration = this.getBitbucketConfiguration(membersAddedToTeamEvent);

            await this.addPermissionsForUserToTeams(bitbucketConfiguration, team.name, projects, membersAddedToTeamEvent);

            return await ctx.messageClient.addressChannels("New user permissions successfully added to associated projects.", team.slackIdentity.teamChannel);
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

    private getBitbucketConfiguration(membersAddedToTeamEvent): BitbucketConfigurationService {
        let teamOwnersUsernames: string[] = [];
        let teamMembersUsernames: string[] = [];

        teamOwnersUsernames = _.union(teamOwnersUsernames, membersAddedToTeamEvent.owners.map(owner => owner.domainUsername));
        teamMembersUsernames = _.union(teamMembersUsernames, membersAddedToTeamEvent.members.map(member => member.domainUsername));
        return new BitbucketConfigurationService(teamOwnersUsernames, teamMembersUsernames, this.bitbucketService);
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

    private async addPermissionsForUserToTeams(bitbucketConfiguration: BitbucketConfigurationService, teamName: string, projects, membersAddedToTeamEvent) {
        try {
            await this.ocService.login();
            const devopsProject = getDevOpsEnvironmentDetails(teamName).openshiftProjectId;
            await this.ocService.addTeamMembershipPermissionsToProject(devopsProject, membersAddedToTeamEvent);
            for (const project of projects) {
                logger.info(`Configuring permissions for project: ${project}`);
                // Add to bitbucket
                await bitbucketConfiguration.configureBitbucketProject(project.bitbucketProject.key);
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
