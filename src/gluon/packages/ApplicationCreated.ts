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
import {url} from "@atomist/slack-messages";
import {QMConfig} from "../../config/QMConfig";
import {ConfigureBasicPackage} from "./ConfigurePackage";

@EventHandler("Receive ApplicationCreatedEvent events", `
subscription ApplicationCreatedEvent {
  ApplicationCreatedEvent {
    id
    application {
      applicationId
      name
      description
      applicationType
    }
    project {
      projectId
      name
      description
    }
    bitbucketRepository {
      bitbucketId
      name
      repoUrl
      remoteUrl
    }
    bitbucketProject {
      id
      key
      name
      description
      url
    }
    owningTeam {
      teamId
      name
      slackIdentity {
        teamChannel
      }
    }
    teams {
      teamId
      name
      slackIdentity {
        teamChannel
      }
    }
    requestedBy {
      firstName
      slackIdentity {
        screenName
      }
    }
    requestConfiguration
  }
}
`)
export class ApplicationCreated implements HandleEvent<any> {

    public handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested ApplicationCreated event: ${JSON.stringify(event.data)}`);

        const applicationCreatedEvent = event.data.ApplicationCreatedEvent[0];
        if (applicationCreatedEvent.requestConfiguration === true) {
            const applicationType = applicationCreatedEvent.application.applicationType.toLowerCase();
            const attachmentText = `The ${applicationType} can now be configured. This determines what type of ${applicationType} it is and how it should be deployed/built within your environments.`;
            return ctx.messageClient.addressChannels({
                text: `The *${applicationCreatedEvent.application.name}* ${applicationType} in the project *${applicationCreatedEvent.project.name}* has been created successfully.`,
                attachments: [{
                    text: attachmentText,
                    fallback: attachmentText,
                    footer: `For more information, please read the ${this.docs("configure-component")}`,
                    color: "#45B254",
                    actions: [
                        buttonForCommand(
                            {text: "Configure Component"},
                            new ConfigureBasicPackage(),
                            {
                                projectName : applicationCreatedEvent.project.name,
                                applicationName : applicationCreatedEvent.application.name,
                                teamName: applicationCreatedEvent.owningTeam.name,
                                screenName : applicationCreatedEvent.requestedBy.slackIdentity.screenName,
                            }),
                    ],
                }],
            },  applicationCreatedEvent.owningTeam.slackIdentity.teamChannel);
        }

        logger.info(`ApplicationCreated event will not request configuration`);

        return Promise.resolve(success());
    }

    private docs(extension): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#${extension}`,
            "documentation")}`;
    }
}
