import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {OCCommandResult} from "../../../openshift/base/OCCommandResult";
import {BitbucketService} from "../../util/bitbucket/Bitbucket";
import {BitbucketConfiguration} from "../../util/bitbucket/BitbucketConfiguration";
import {OCService} from "../../util/openshift/OCService";
import {getProjectDisplayName} from "../../util/project/Project";
import {ProjectService} from "../../util/project/ProjectService";
import {
    ChannelMessageClient,
    handleQMError,
    OCResultError,
    QMError,
} from "../../util/shared/Error";

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

    constructor(private projectService = new ProjectService(),
                private bitbucketService = new BitbucketService(),
                private ocService = new OCService()) {
    }

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested MembersAddedToTeamEvent event: ${JSON.stringify(event.data)}`);

        const membersAddedToTeamEvent = event.data.MembersAddedToTeamEvent[0];

        try {
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
            projects = await this.projectService.gluonProjectsWhichBelongToGluonTeam(teamName, false);
        } catch (error) {
            throw new QMError(error, "Failed to get list of projects associated with this team.");
        }
        return projects;
    }

    private getBitbucketConfiguration(membersAddedToTeamEvent): BitbucketConfiguration {
        let teamOwnersUsernames: string[] = [];
        let teamMembersUsernames: string[] = [];

        teamOwnersUsernames = _.union(teamOwnersUsernames, membersAddedToTeamEvent.owners.map(owner => owner.domainUsername));
        teamMembersUsernames = _.union(teamMembersUsernames, membersAddedToTeamEvent.members.map(member => member.domainUsername));
        return new BitbucketConfiguration(teamOwnersUsernames, teamMembersUsernames, this.bitbucketService);
    }

    private async addPermissionsForUserToTeams(bitbucketConfiguration: BitbucketConfiguration, teamName: string, projects, membersAddedToTeamEvent) {
        try {
            await this.ocService.login();
            const devopsProject = `${_.kebabCase(teamName).toLowerCase()}-devops`;
            await this.ocService.addTeamMembershipPermissionsToProject(devopsProject, membersAddedToTeamEvent);
            for (const project of projects) {
                logger.info(`Configuring permissions for project: ${project}`);
                // Add to bitbucket
                await bitbucketConfiguration.configureBitbucketProject(project.bitbucketProject.key);
                // Add to openshift environments
                for (const environment of ["dev", "sit", "uat"]) {
                    const projectId = getProjectDisplayName(project.owningTenant, project.name, environment);
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
