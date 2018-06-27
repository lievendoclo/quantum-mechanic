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
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {handleQMError, QMError, UserMessageClient} from "../shared/Error";
import {isSuccessCode} from "../shared/Http";
import {bitbucketAxios, bitbucketProjectFromKey} from "./Bitbucket";
import {
    addBitbucketProjectAccessKeys,
    BitbucketConfiguration,
} from "./BitbucketConfiguration";

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

            const bitbucketConfiguration = new BitbucketConfiguration(
                teamOwners,
                teamMembers,
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
        const createBitbucketProjectRequest = await bitbucketAxios().post(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects`,
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
                const bitbucketProject = await bitbucketProjectFromKey(projectKey);
                this.bitbucketProjectId = bitbucketProject.id;
                this.bitbucketProjectUrl = bitbucketProject.links.self[0].href;
            } else {
                logger.error(`Failed to create bitbucket project. Error ${JSON.stringify(createBitbucketProjectRequest)}`);
                throw new QMError(`Failed to create bitbucket project. Bitbucket rejected the request.`);
            }
        }
    }

    private async addBitbucketProjectAccessKeys(bitbucketProjectKey: string, projectName: string) {
        try {
            await addBitbucketProjectAccessKeys(bitbucketProjectKey);
        } catch (error) {
            logger.error(`Failed to configure Bitbucket Project ${projectName} with error: ${JSON.stringify(error)}`);
            throw new QMError(`There was an error adding SSH keys for ${projectName} Bitbucket project`);
        }
    }

    private async confirmBitbucketProjectCreatedWithGluon(projectId: string, projectName: string) {
        logger.info(`Confirming Bitbucket project: [${this.bitbucketProjectId}-${this.bitbucketProjectUrl}]`);
        const confirmBitbucketProjectCreatedResult = await axios.put(`${QMConfig.subatomic.gluon.baseUrl}/projects/${projectId}`,
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
