import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    success,
} from "@atomist/automation-client";
import {url} from "@atomist/slack-messages";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {BitbucketConfigurationService} from "../../services/bitbucket/BitbucketConfigurationService";
import {BitbucketService} from "../../services/bitbucket/BitbucketService";
import {GluonService} from "../../services/gluon/GluonService";
import {
    handleQMError,
    QMError,
    UserMessageClient,
} from "../../util/shared/Error";
import {isSuccessCode} from "../../util/shared/Http";

@EventHandler("Receive BitbucketProjectRequestedEvent events", `
subscription BitbucketProjectRequestedEvent {
  BitbucketProjectRequestedEvent {
    id
    project {
      projectId
      name
      description
    }
    teams {
      teamId
      name
      slackIdentity {
        teamChannel
      }
      owners {
        firstName
        domainUsername
        slackIdentity {
          screenName
        }
      }
      members {
        firstName
        domainUsername
        slackIdentity {
          screenName
        }
      }
    }
    bitbucketProjectRequest {
      key
      name
      description
    }
    requestedBy {
      firstName
      slackIdentity {
        screenName
      }
    }
  }
}
`)
export class BitbucketProjectRequested implements HandleEvent<any> {

    private bitbucketProjectId: string;

    private bitbucketProjectUrl: string;

    constructor(private bitbucketService = new BitbucketService(), private gluonService = new GluonService()) {
    }

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested BitbucketProjectRequested event: ${JSON.stringify(event.data)}`);

        const bitbucketProjectRequestedEvent = event.data.BitbucketProjectRequestedEvent[0];
        try {
            const key: string = bitbucketProjectRequestedEvent.bitbucketProjectRequest.key;
            const name: string = bitbucketProjectRequestedEvent.bitbucketProjectRequest.name;
            const description: string = bitbucketProjectRequestedEvent.bitbucketProjectRequest.description;

            let teamOwners: string[] = [];
            let teamMembers: string[] = [];
            bitbucketProjectRequestedEvent.teams.map(team => {
                teamOwners = _.union(teamOwners, team.owners.map(owner => owner.domainUsername));
                teamMembers = _.union(teamMembers, team.members.map(member => member.domainUsername));
            });

            const bitbucketConfiguration = new BitbucketConfigurationService(
                teamOwners,
                teamMembers,
                this.bitbucketService,
            );

            await this.createBitbucketProject(key, name, description);

            await bitbucketConfiguration.configureBitbucketProject(key);

            await this.addBitbucketProjectAccessKeys(key, bitbucketProjectRequestedEvent.project.name);

            return await this.confirmBitbucketProjectCreatedWithGluon(bitbucketProjectRequestedEvent.project.projectId, bitbucketProjectRequestedEvent.project.name);

        } catch (error) {
            return await this.handleError(ctx, bitbucketProjectRequestedEvent.requestedBy.slackIdentity.screenName, error);
        }
    }

    private async createBitbucketProject(projectKey: string, projectName: string, projectDescription: string) {
        const createBitbucketProjectRequest = await this.bitbucketService.createBitbucketProject(
            {
                projectKey,
                projectName,
                projectDescription,
            });

        if (isSuccessCode(createBitbucketProjectRequest.status)) {
            const project = createBitbucketProjectRequest.data;
            logger.info(`Created project: ${JSON.stringify(project)} -> ${project.id} + ${project.links.self[0].href}`);
            this.bitbucketProjectId = project.id;
            this.bitbucketProjectUrl = project.links.self[0].href;
        } else {
            logger.warn(`Error creating project: ${createBitbucketProjectRequest.status}`);
            if (createBitbucketProjectRequest.status === 201 || createBitbucketProjectRequest.status === 409) {
                logger.warn(`Project probably already exists.`);
                const bitbucketProject = await this.getBitbucketProject(projectKey);
                this.bitbucketProjectId = bitbucketProject.id;
                this.bitbucketProjectUrl = bitbucketProject.links.self[0].href;
            } else {
                logger.error(`Failed to create bitbucket project. Error ${JSON.stringify(createBitbucketProjectRequest)}`);
                throw new QMError(`Failed to create bitbucket project. Bitbucket rejected the request.`);
            }
        }
    }

    private async getBitbucketProject(bitbucketProjectKey: string) {
        const bitbucketProjectRequestResult = await this.bitbucketService.bitbucketProjectFromKey(
            bitbucketProjectKey,
        );

        if (!isSuccessCode(bitbucketProjectRequestResult.status)) {
            throw new QMError("Unable to find the specified project in Bitbucket. Please make sure it exists.");
        }

        return bitbucketProjectRequestResult.data;
    }

    private async addBitbucketProjectAccessKeys(bitbucketProjectKey: string, projectName: string) {
        try {
            await this.bitbucketService.addBitbucketProjectAccessKeys(bitbucketProjectKey);
        } catch (error) {
            logger.error(`Failed to configure Bitbucket Project ${projectName} with error: ${JSON.stringify(error)}`);
            throw new QMError(`There was an error adding SSH keys for ${projectName} Bitbucket project`);
        }
    }

    private async confirmBitbucketProjectCreatedWithGluon(projectId: string, projectName: string) {
        logger.info(`Confirming Bitbucket project: [${this.bitbucketProjectId}-${this.bitbucketProjectUrl}]`);
        const confirmBitbucketProjectCreatedResult = await this.gluonService.projects.confirmBitbucketProjectCreated(projectId,
            {
                bitbucketProject: {
                    bitbucketProjectId: this.bitbucketProjectId,
                    url: this.bitbucketProjectUrl,
                },
            });
        if (!isSuccessCode(confirmBitbucketProjectCreatedResult.status)) {
            logger.error(`Could not confirm Bitbucket project: [${confirmBitbucketProjectCreatedResult.status}-${confirmBitbucketProjectCreatedResult.data}]`);
            throw new QMError(`There was an error confirming the ${projectName} Bitbucket project details`);
        }
        return success();
    }

    private async handleError(ctx: HandlerContext, screenName: string, error) {
        const messageClient = new UserMessageClient(ctx);
        messageClient.addDestination(screenName);
        return await handleQMError(messageClient, error);
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference`,
            "documentation")}`;
    }
}
