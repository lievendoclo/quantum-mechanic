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
import {QMConfig} from "../../config/QMConfig";
import {NewProjectEnvironments} from "../project/ProjectEnvironments";

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

    public handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested BitbucketProjectAddedEvent event: ${JSON.stringify(event.data)}`);

        const addedEvent = event.data.BitbucketProjectAddedEvent[0];
        return ctx.messageClient.addressChannels({
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
                    footer: `For more information, please read the ${this.docs() + "#request-project-environments"}`,
                    color: "#45B254",
                    actions: [
                        buttonForCommand(
                            {text: "Create OpenShift environments"},
                            new NewProjectEnvironments(),
                            {
                                projectName: addedEvent.project.name,
                            }),
                    ],
                },
//                 {
//                     text: `
// Since you already have a Subatomic project and OpenShift environment ready, you can now add packages. \
// A package is either an application or a shared library, click the button below to create an application now.`,
//                     fallback: "Create or link existing OpenShift environments",
//                     footer: `For more information, please read the ${this.docs()}`,
//                     color: "#45B254",
//                     actions: [
//                         buttonForCommand(
//                             {text: "Create application"},
//                             new NewProjectEnvironments(),
//                             {}),
//                     ]
//                 }, {
                {
                    text: `
Projects can be associated with multiple teams. \
If you would like to associate more teams to the *${addedEvent.project.name}* project, please use the \`@atomist sub associate team\` command`,
                    fallback: "Associate multiple teams to this project",
                    footer: `For more information, please read the ${this.docs() + "#associate-team"}`,
                    color: "#00a5ff",
                }],
        }, addedEvent.teams.map(team => team.slackIdentity.teamChannel));
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference`,
            "documentation")}`;
    }
}
