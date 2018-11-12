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
import {BitbucketProjectRecommendedPracticesCommand} from "../../commands/bitbucket/BitbucketProjectRecommendedPracticesCommand";
import {AssociateTeam} from "../../commands/project/AssociateTeam";
import {NewProjectEnvironments} from "../../commands/project/NewProjectEnvironments";
import {BitbucketService} from "../../services/bitbucket/BitbucketService";
import {ConfigureBitbucketProjectAccess} from "../../tasks/bitbucket/ConfigureBitbucketProjectAccess";
import {TaskListMessage} from "../../tasks/TaskListMessage";
import {TaskRunner} from "../../tasks/TaskRunner";
import {QMProjectBase} from "../../util/project/Project";
import {ChannelMessageClient, handleQMError} from "../../util/shared/Error";

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

        const bitbucketProjectAddedEvent = event.data.BitbucketProjectAddedEvent[0];

        const messageClient = new ChannelMessageClient(ctx);

        bitbucketProjectAddedEvent.teams
            .filter(team => team.slackIdentity !== undefined)
            .forEach(team => messageClient.addDestination(team.slackIdentity.teamChannel));

        try {

            const project = bitbucketProjectAddedEvent.project;

            const qmProject: QMProjectBase = {
                projectId: project.projectId,
                name: project.name,
                bitbucketProject: bitbucketProjectAddedEvent.bitbucketProject,
            };

            const taskListMessage: TaskListMessage = new TaskListMessage(":rocket: Configuring Bitbucket Project Access...", messageClient);
            const taskRunner: TaskRunner = new TaskRunner(taskListMessage);

            for (const team of bitbucketProjectAddedEvent.teams) {
                taskRunner.addTask(
                    new ConfigureBitbucketProjectAccess(team, qmProject, this.bitbucketService),
                );
            }

            await taskRunner.execute(ctx);

            return await messageClient.send(this.getBitbucketAddedSuccessfullyMessage(bitbucketProjectAddedEvent));

        } catch (error) {
            return await handleQMError(messageClient, error);
        }
    }

    private getBitbucketAddedSuccessfullyMessage(bitbucketAddedEvent) {

        const associateTeamCommand: AssociateTeam = new AssociateTeam();
        associateTeamCommand.projectName = bitbucketAddedEvent.project.name;

        return {
            text: `
The *${bitbucketAddedEvent.bitbucketProject.name}* Bitbucket project has been configured successfully and linked to the *${bitbucketAddedEvent.project.name}* Subatomic project.
Click here to view the project in Bitbucket: ${bitbucketAddedEvent.bitbucketProject.url}`,
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
                                projectName: bitbucketAddedEvent.project.name,
                            }),
                    ],
                },
                {
                    text: `
You can apply recommended practice settings to your bitbucket project. \
This includes setting team owners as default reviewers, adding pre-merge hooks, and protecting master from direct commits. \
These can be manually changed if you wish to change the settings after applying them.\
If you would like to configure the Bitbucket Project associated to the *${bitbucketAddedEvent.project.name}* project, please click the button below.`,
                    fallback: "Associate multiple teams to this project",
                    footer: `For more information, please read the ${this.docs("associate-team")}`,
                    color: "#00a5ff",
                    actions: [
                        buttonForCommand(
                            {
                                text: "Apply recommended practices",
                            },
                            new BitbucketProjectRecommendedPracticesCommand(),
                            {
                                projectName: bitbucketAddedEvent.project.name,
                            }),
                    ],
                },
                {
                    text: `
Projects can be associated with multiple teams. \
If you would like to associate more teams to the *${bitbucketAddedEvent.project.name}* project, please click the button below`,
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
        };
    }

    private docs(extension): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/quantum-mechanic/command-reference#${extension}`,
            "documentation")}`;
    }
}
