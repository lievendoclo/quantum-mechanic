import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import {addressSlackChannelsFromContext} from "@atomist/automation-client/spi/message/MessageClient";
import {menuForCommand} from "@atomist/automation-client/spi/message/MessageClient";
import {SlackMessage, url} from "@atomist/slack-messages";
import {Attachment} from "@atomist/slack-messages/SlackMessages";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {OCService} from "../../services/openshift/OCService";
import {
    GluonProjectNameSetter,
    GluonTeamNameSetter,
    setGluonProjectName,
    setGluonTeamName,
} from "../../util/recursiveparam/GluonParameterSetters";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../../util/recursiveparam/RecursiveParameterRequestCommand";
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";

@CommandHandler("Create a new OpenShift Persistent Volume Claim", QMConfig.subatomic.commandPrefix + " create openshift pvc")
export class CreateOpenShiftPvc extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter, GluonProjectNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        projectName: "PROJECT_NAME",
        openshiftProjectNames: "OPENSHIFT_PROJECT_NAMES",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        recursiveKey: CreateOpenShiftPvc.RecursiveKeys.teamName,
        selectionMessage: `Please select a team associated with the project you wish to create a PVC for`,
    })
    public teamName: string;

    @RecursiveParameter({
        recursiveKey: CreateOpenShiftPvc.RecursiveKeys.projectName,
        selectionMessage: `Please select the project, whose OpenShift environments the PVCs will be created in`,
    })
    public projectName: string;

    @RecursiveParameter({
        recursiveKey: CreateOpenShiftPvc.RecursiveKeys.openshiftProjectNames,
        selectionMessage: "Please select the project environment(s) to create the PVCs in",
    })
    public openShiftProjectNames: string;

    @Parameter({
        description: "a name for your Persistent Volume Claim",
        required: true,
    })
    public pvcName: string;

    constructor(public gluonService = new GluonService(),
                private ocService = new OCService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        try {

            await this.ocService.login();

            const projectId = _.kebabCase(this.projectName);

            if (this.openShiftProjectNames === "all") {
                this.openShiftProjectNames = `${projectId}-dev,${projectId}-sit,${projectId}-uat`;
            }

            const pvcName = _.kebabCase(this.pvcName).toLowerCase();
            const pvcAttachments: Attachment[] = [];

            for (const environment of this.openShiftProjectNames.split(",")) {
                logger.debug(`Adding PVC to OpenShift project: ${environment}`);
                await this.ocService.createPVC(pvcName, environment);
                pvcAttachments.push({
                    fallback: `PVC created`,
                    text: `
*${pvcName}* PVC successfully created in *${environment}*`,
                    mrkdwn_in: ["text"],
                    title_link: `${QMConfig.subatomic.openshiftNonProd.masterUrl}/console/project/${environment}/browse/persistentvolumeclaims/${pvcName}`,
                    title: `${environment}`,
                    color: "#45B254",
                });
            }

            return await this.sendPvcResultMessage(ctx, pvcAttachments);
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(CreateOpenShiftPvc.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(CreateOpenShiftPvc.RecursiveKeys.projectName, setGluonProjectName);
        this.addRecursiveSetter(CreateOpenShiftPvc.RecursiveKeys.openshiftProjectNames, setProjectForPvc);

    }

    private async sendPvcResultMessage(ctx: HandlerContext, pvcAttachments: any[]): Promise<HandlerResult> {
        const destination =  await addressSlackChannelsFromContext(ctx, this.teamChannel);
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

        return await ctx.messageClient.send(msg, destination);
    }

    private docs(): string {
        return `${url(`${QMConfig.subatomic.docs.baseUrl}/storage`,
            "documentation")}`;
    }

}

async function setProjectForPvc(ctx: HandlerContext, commandHandler: CreateOpenShiftPvc, selectionMessage: string) {
    const projectId = _.kebabCase(commandHandler.projectName);

    const msg: SlackMessage = {
        text: selectionMessage,
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
                    commandHandler, "openShiftProjectNames",
                    {
                        teamName: commandHandler.teamName,
                        projectName: commandHandler.projectName,
                        pvcName: commandHandler.pvcName,
                    }),
            ],
        }],
    };

    return await ctx.messageClient.respond(msg);
}
