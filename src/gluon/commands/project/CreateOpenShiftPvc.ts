import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import {menuForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import {Attachment} from "@atomist/slack-messages/SlackMessages";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {OCClient} from "../../../openshift/OCClient";
import {ProjectService} from "../../util/project/ProjectService";
import {
    handleQMError,
    logErrorAndReturnSuccess,
    ResponderMessageClient,
} from "../../util/shared/Error";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/shared/RecursiveParameterRequestCommand";
import {TeamService} from "../../util/team/TeamService";

@CommandHandler("Create a new OpenShift Persistent Volume Claim", QMConfig.subatomic.commandPrefix + " create openshift pvc")
export class CreateOpenShiftPvc extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "Gluon team name associated with the project the PVC will be created for",
        required: false,
        displayable: false,
    })
    public gluonTeamName;

    @RecursiveParameter({
        description: "Gluon project name",
    })
    public gluonProjectName: string;

    @RecursiveParameter({
        description: "OpenShift project names (comma separated) that the PVCs will be create in",
    })
    public openShiftProjectNames: string;

    @Parameter({
        description: "a name for your Persistent Volume Claim",
        required: true,
    })
    public pvcName: string;

    constructor(private teamService = new TeamService(),
                private projectService = new ProjectService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            const projectId = _.kebabCase(this.gluonProjectName);

            if (this.openShiftProjectNames === "all") {
                this.openShiftProjectNames = `${projectId}-dev,${projectId}-sit,${projectId}-uat`;
            }

            const pvcName = _.kebabCase(this.pvcName).toLowerCase();
            const pvcAttachments: Attachment[] = [];

            for (const environment of this.openShiftProjectNames.split(",")) {
                logger.debug(`Adding PVC to OpenShift project: ${environment}`);
                await OCClient.createPvc(pvcName, environment);
                pvcAttachments.push({
                    fallback: `PVC created`,
                    text: `
*${pvcName}* PVC successfully created in *${environment}*`,
                    mrkdwn_in: ["text"],
                    title_link: `${QMConfig.subatomic.openshift.masterUrl}/console/project/${environment}/browse/persistentvolumeclaims/${pvcName}`,
                    title: `${environment}`,
                    color: "#45B254",
                });
            }

            return await this.sendPvcResultMessage(ctx, pvcAttachments);
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected async setNextParameter(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.gluonProjectName)) {
            const team = await this.teamService.gluonTeamForSlackTeamChannel(this.teamChannel);

            if (!_.isEmpty(team)) {
                return await this.presentMenuToSelectProjectToCreatePvcFor(ctx);
            } else {
                return await this.presentMenuToSelectProjectAssociatedTeam(ctx);
            }
        }
        if (_.isEmpty(this.openShiftProjectNames)) {
            const projectId = _.kebabCase(this.gluonProjectName);
            return await this.presentMenuToSelectOpenshiftProjectToCreatePvcIn(ctx, projectId);
        }
    }

    private async sendPvcResultMessage(ctx: HandlerContext, pvcAttachments: any[]): Promise<HandlerResult> {
        const msg: SlackMessage = {
            text: `Your Persistent Volume Claims have been processed...`,
            attachments: pvcAttachments.concat({
                fallback: `Using PVCs`,
                text: `
Now that your PVCs have been created, you can add this PVC as storage to an application. Follow the Subatomic documentation for more details on how to add storage.`,
                color: "#00a5ff",
                mrkdwn_in: ["text"],
                thumb_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/OpenShift-LogoType.svg/959px-OpenShift-LogoType.svg.png",
                footer: `For more information, please read the ${this.docs()}`,
            } as Attachment),
        };

        return await ctx.messageClient.addressChannels(msg, this.teamChannel);
    }

    private async presentMenuToSelectProjectAssociatedTeam(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            const teams = await this.teamService.gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName);
            const msg: SlackMessage = {
                text: "Please select a team associated with the project you wish to create a PVC for",
                attachments: [{
                    fallback: "Please select a team",
                    actions: [
                        menuForCommand({
                                text: "Select Team", options:
                                    teams.map(team => {
                                        return {
                                            value: team.name,
                                            text: team.name,
                                        };
                                    }),
                            },
                            this, "gluonTeamName",
                            {pvcName: this.pvcName}),
                    ],
                }],
            };

            return await ctx.messageClient.respond(msg);
        } catch (error) {
            return await logErrorAndReturnSuccess(this.teamService.gluonTeamsWhoSlackScreenNameBelongsTo.name, error);
        }
    }

    private async presentMenuToSelectProjectToCreatePvcFor(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            const teams = await this.projectService.gluonProjectsWhichBelongToGluonTeam(ctx, this.gluonTeamName);

            const msg: SlackMessage = {
                text: "Please select the project, whose OpenShift environments the PVCs will be created in",
                attachments: [{
                    fallback: "Please select a project",
                    actions: [
                        menuForCommand({
                                text: "Select Project", options:
                                    teams.map(project => {
                                        return {
                                            value: project.name,
                                            text: project.name,
                                        };
                                    }),
                            },
                            this, "gluonProjectName",
                            {
                                gluonTeamName: this.gluonTeamName,
                                pvcName: this.pvcName,
                            }),
                    ],
                }],
            };

            return await ctx.messageClient.respond(msg);
        } catch (error) {
            return await logErrorAndReturnSuccess(this.projectService.gluonProjectsWhichBelongToGluonTeam.name, error);
        }
    }

    private async presentMenuToSelectOpenshiftProjectToCreatePvcIn(ctx: HandlerContext, projectId: string) {
        const msg: SlackMessage = {
            text: "Please select the project environment(s) to create the PVCs in",
            attachments: [{
                fallback: "Please select a project",
                actions: [
                    menuForCommand({
                            text: "Select environment(s)", options:
                                [
                                    {value: "all", text: "All environments"},
                                    {
                                        value: `${projectId}-dev`,
                                        text: `${projectId}-dev`,
                                    },
                                    {
                                        value: `${projectId}-sit`,
                                        text: `${projectId}-sit`,
                                    },
                                    {
                                        value: `${projectId}-uat`,
                                        text: `${projectId}-uat`,
                                    },
                                ],
                        },
                        this, "openShiftProjectNames",
                        {
                            gluonTeamName: this.gluonTeamName,
                            gluonProjectName: this.gluonProjectName,
                            pvcName: this.pvcName,
                        }),
                ],
            }],
        };

        return await ctx.messageClient.respond(msg);
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/storage`,
            "documentation")}`;
    }

}
