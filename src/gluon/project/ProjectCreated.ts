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
import {
    ListExistingBitbucketProject,
    NewBitbucketProject,
} from "../bitbucket/BitbucketProject";
import {NewProjectEnvironments} from "./ProjectEnvironments";

@EventHandler("Receive ProjectCreated events", `
subscription ProjectCreatedEvent {
  ProjectCreatedEvent {
    id
    project {
      projectId
      name
      description
    }
    team {
      teamId
      name
      slackIdentity {
        teamChannel
      }
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
export class ProjectCreated implements HandleEvent<any> {

    public handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested ProjectCreated event: ${JSON.stringify(event.data)}`);

        const projectCreatedEvent = event.data.ProjectCreatedEvent[0];
        return ctx.messageClient.addressChannels({
            text: `The ${projectCreatedEvent.project.name} project has been created successfully by @${projectCreatedEvent.createdBy.slackIdentity.screenName} 👍`,
            attachments: [{
                text: `
A Subatomic project is linked to a Bitbucket project. \
This can be a new Bitbucket project that will be created and configured according to best practice or you can choose to link an existing project. The existing project will also be configured accordingly.`,
                fallback: "Create or link Bitbucket project",
                footer: `For more information, please read the ${this.docs()}`, // TODO use actual icon
                color: "#45B254",
                actions: [
                    buttonForCommand(
                        {text: "Create Bitbucket project"},
                        new NewBitbucketProject(),
                        {
                            name: projectCreatedEvent.project.name,
                        }),
                    buttonForCommand(
                        {text: "Link existing Bitbucket project"},
                        new ListExistingBitbucketProject(), {
                            projectName: projectCreatedEvent.project.name,
                        }),
                ],
            }, {
                text: `
A Subatomic project is deployed into the OpenShift platform. \
The platform consists of two clusters, an Non Prod and a Prod cluster. The project environments span both clusters and are the deployment targets for the applications managed by Subatomic.
These environments are realised as OpenShift projects and need to be created or linked to existing projects. If you haven't done either, please do that now.`,
                fallback: "Create or link existing OpenShift environments",
                footer: `For more information, please read the ${this.docs()}`, // TODO use actual icon
                color: "#45B254",
                actions: [
                    buttonForCommand(
                        {text: "Create OpenShift environments"},
                        new NewProjectEnvironments(),
                        {
                            projectName: projectCreatedEvent.project.name,
                        }),
                ],
            }, {
                text: `
Projects can be associated with multiple teams. \
If you would like to associate more teams to the *${projectCreatedEvent.project.name}* project, please use the \`@atomist subatomic associate team\` command`,
                fallback: "Associate multiple teams to this project",
                footer: `For more information, please read the ${this.docs()}`, // TODO use actual icon
                color: "#00a5ff",
            }],
        }, projectCreatedEvent.team.slackIdentity.teamChannel);
    }

    private docs(): string {
        return `${url("https://subatomic.bison.absa.co.za/docs/projects",
            "documentation")}`;
    }
}
