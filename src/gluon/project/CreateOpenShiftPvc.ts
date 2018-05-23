import {
    CommandHandler,
    HandleCommand,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    SuccessPromise,
} from "@atomist/automation-client";
import {menuForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import {Attachment} from "@atomist/slack-messages/SlackMessages";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {OCClient} from "../../openshift/OCClient";
import {logErrorAndReturnSuccess} from "../shared/Error";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo,
} from "../team/Teams";
import {gluonProjectsWhichBelongToGluonTeam} from "./Projects";

@CommandHandler("Create a new OpenShift Persistent Volume Claim", QMConfig.subatomic.commandPrefix + " create openshift pvc")
export class CreateOpenShiftPvc implements HandleCommand<HandlerResult> {

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

    @Parameter({
        description: "Gluon project name",
        required: false,
        displayable: false,
    })
    public gluonProjectName: string;

    @Parameter({
        description: "OpenShift project names (comma separated) that the PVCs will be create in",
        required: false,
        displayable: false,
    })
    public openShiftProjectNames: string;

    @Parameter({
        description: "a name for your Persistent Volume Claim",
        required: true,
    })
    public pvcName: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        const projectId = _.kebabCase(this.gluonProjectName);

        if (_.isEmpty(this.gluonProjectName)) {
            if (_.isEmpty(this.teamChannel)) {
                return this.presentMenuToSelectProjectAssociatedTeam(ctx);
            } else {
                return gluonTeamForSlackTeamChannel(this.teamChannel).then(team => {
                    if (!_.isEmpty(team)) {
                        return this.presentMenuToSelectProjectToCreatePvcFor(ctx);
                    } else {
                        return this.presentMenuToSelectProjectAssociatedTeam(ctx);
                    }
                });
            }
        } else if (_.isEmpty(this.openShiftProjectNames)) {
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

            return ctx.messageClient.respond(msg);
        }

        if (this.openShiftProjectNames === "all") {
            this.openShiftProjectNames = `${projectId}-dev,${projectId}-sit,${projectId}-uat`;
        }

        const pvcName = _.kebabCase(this.pvcName).toLowerCase();
        const pvcAttachments: Attachment[] = [];
        return Promise.all(this.openShiftProjectNames.split(",")
            .map(environment => {
                logger.debug(`Adding PVC to OpenShift project: ${environment}`);
                return OCClient.createPvc(pvcName, environment)
                    .then(() => {
                        pvcAttachments.push({
                            fallback: `PVC created`,
                            text: `
*${pvcName}* PVC successfully created in *${environment}*`,
                            mrkdwn_in: ["text"],
                            title_link: `${QMConfig.subatomic.openshift.masterUrl}/console/project/${environment}/browse/persistentvolumeclaims/${pvcName}`,
                            title: `${environment}`,
                            color: "#45B254",
                        });

                        return SuccessPromise;
                    });
            }))
            .then(() => {
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

                return ctx.messageClient.addressChannels(msg, this.teamChannel);
            });
    }

    private presentMenuToSelectProjectAssociatedTeam(ctx: HandlerContext): Promise<HandlerResult> {
        return gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName).then(teams => {
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

            return ctx.messageClient.respond(msg);
        }).catch(error => {
            logErrorAndReturnSuccess(gluonTeamsWhoSlackScreenNameBelongsTo.name, error);
        });
    }

    private presentMenuToSelectProjectToCreatePvcFor(ctx: HandlerContext): Promise<HandlerResult> {
        return gluonProjectsWhichBelongToGluonTeam(ctx, this.gluonTeamName).then(teams => {
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

            return ctx.messageClient.respond(msg);
        }).catch(error => {
            logErrorAndReturnSuccess(gluonProjectsWhichBelongToGluonTeam.name, error);
        });
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/storage`,
            "documentation")}`;
    }
}
