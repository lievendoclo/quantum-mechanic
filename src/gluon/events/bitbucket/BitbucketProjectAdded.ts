import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
} from "@atomist/automation-client";
import {buttonForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {url} from "@atomist/slack-messages";
import {QMConfig} from "../../../config/QMConfig";
import {AssociateTeam} from "../../commands/project/AssociateTeam";
import {NewProjectEnvironments} from "../../commands/project/ProjectEnvironments";
import {BitbucketService} from "../../util/bitbucket/Bitbucket";
import {handleQMError, QMError, UserMessageClient} from "../../util/shared/Error";

@EventHandler("Receive BitbucketProjectAddedEvent events", `
subscription BitbucketProjectAddedEvent {
  BitbucketProjectAddedEvent {
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
    }
    bitbucketProject {
      id
      key
      name
      description
      url
    }
    createdBy {
      firstName
      slackIdentity {
        screenName
      }
    }
  }
}
`)
export class BitbucketProjectAdded implements HandleEvent<any> {

    constructor(private bitbucketService = new BitbucketService()) {
    }

    public async handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested BitbucketProjectAddedEvent event: ${JSON.stringify(event.data)}`);

        const addedEvent = event.data.BitbucketProjectAddedEvent[0];

        try {
            await this.addBitbucketProjectAccessKeys(addedEvent.bitbucketProject.key, addedEvent.project.name);

            return await this.sendBitbucketAddedSuccessfullyMessage(ctx, addedEvent);
        } catch (error) {
            return await this.handleError(ctx, addedEvent.createdBy.slackIdentity.screenName, error);
        }
    }

    private async addBitbucketProjectAccessKeys(bitbucketProjectKey: string, projectName: string) {
        try {
            await this.bitbucketService.addBitbucketProjectAccessKeys(bitbucketProjectKey);
        } catch (error) {
            logger.error(`Failed to configure Bitbucket Project ${projectName} with error: ${JSON.stringify(error)}`);
            throw new QMError(`There was an error adding SSH keys for ${projectName} Bitbucket project`);
        }
    }

    private async sendBitbucketAddedSuccessfullyMessage(ctx: HandlerContext, addedEvent) {

        const associateTeamCommand: AssociateTeam = new AssociateTeam();
        associateTeamCommand.projectName = addedEvent.project.name;

        return await ctx.messageClient.addressChannels({
            text: `
The *${addedEvent.bitbucketProject.name}* Bitbucket project has been configured successfully and linked to the *${addedEvent.project.name}* Subatomic project.
Click here to view the project in Bitbucket: ${addedEvent.bitbucketProject.url}`,
            attachments: [
                {
                    text: `
A Subatomic project is deployed into the OpenShift platform. \
The platform consists of two clusters, a Non Prod and a Prod cluster. The project environments span both clusters and are the deployment targets for the applications managed by Subatomic.
These environments are realised as OpenShift projects and need to be created or linked to existing projects. If you haven't done either, please do that now.`,
                    fallback: "Create or link existing OpenShift environments",
                    footer: `For more information, please read the ${this.docs("request-project-environments")}`,
                    color: "#45B254",
                    thumb_url: "https://raw.githubusercontent.com/absa-subatomic/subatomic-documentation/gh-pages/images/openshift-logo.png",
                    actions: [
                        buttonForCommand(
                            {text: "Create OpenShift environments"},
                            new NewProjectEnvironments(),
                            {
                                projectName: addedEvent.project.name,
                            }),
                    ],
                },
                {
                    text: `
Projects can be associated with multiple teams. \
If you would like to associate more teams to the *${addedEvent.project.name}* project, please use the \`@atomist sub associate team\` command`,
                    fallback: "Associate multiple teams to this project",
                    footer: `For more information, please read the ${this.docs("associate-team")}`,
                    color: "#00a5ff",
                    actions: [
                        buttonForCommand(
                            {
                                text: "Associate team",
                            },
                            associateTeamCommand),
                    ],
                }],
        }, addedEvent.teams.map(team => team.slackIdentity.teamChannel));
    }

    private docs(extension): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#${extension}`,
            "documentation")}`;
    }

    private async handleError(ctx: HandlerContext, screenName: string, error) {
        const messageClient = new UserMessageClient(ctx);
        messageClient.addDestination(screenName);
        return await handleQMError(messageClient, error);
    }
}
