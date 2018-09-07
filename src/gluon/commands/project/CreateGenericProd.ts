import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import {v4 as uuid} from "uuid";
import {QMConfig} from "../../../config/QMConfig";
import {GenericProdRequestMessages} from "../../messages/project/GenericProdRequestMessages";
import {GluonService} from "../../services/gluon/GluonService";
import {OCService} from "../../services/openshift/OCService";
import {GenericOpenshiftResourceService} from "../../services/projects/GenericOpenshiftResourceService";
import {
    getHighestPreProdEnvironment,
    getResourceDisplayMessage,
} from "../../util/openshift/Helpers";
import {getProjectId} from "../../util/project/Project";
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
import {ApprovalEnum} from "../../util/shared/ApprovalEnum";
import {
    ChannelMessageClient,
    handleQMError,
    QMMessageClient,
    ResponderMessageClient,
} from "../../util/shared/Error";

@CommandHandler("Move openshift resources to prod", QMConfig.subatomic.commandPrefix + " request generic prod")
export class CreateGenericProd extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter, GluonProjectNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        projectName: "PROJECT_NAME",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        recursiveKey: CreateGenericProd.RecursiveKeys.teamName,
        selectionMessage: "Please select a team associated with the project you wish to configure the package for",
    })
    public teamName: string;

    @RecursiveParameter({
        recursiveKey: CreateGenericProd.RecursiveKeys.projectName,
        selectionMessage: "Please select the owning project of the package you wish to configure",
    })
    public projectName: string;

    @Parameter({
        required: false,
        displayable: false,
    })
    public approval: ApprovalEnum = ApprovalEnum.CONFIRM;

    @Parameter({
        required: false,
        displayable: false,
    })
    public correlationId: string;

    @Parameter({
        required: false,
        displayable: false,
    })
    public openShiftResourcesJSON: string;

    private genericProdRequestMessages = new GenericProdRequestMessages();

    constructor(public gluonService = new GluonService(), public ocService = new OCService(), public genericOpenshiftResourceService = new GenericOpenshiftResourceService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            const team = await this.gluonService.teams.gluonTeamByName(this.teamName);
            const qmMessageClient = new ChannelMessageClient(ctx).addDestination(team.slack.teamChannel);

            if (this.approval === ApprovalEnum.CONFIRM) {
                this.correlationId = uuid();
                return await this.getRequestConfirmation(qmMessageClient);
            } else if (this.approval === ApprovalEnum.APPROVED) {

                await this.createGenericProdRequest();

                return await qmMessageClient.send(this.getConfirmationResultMesssage(this.approval), {id: this.correlationId});
            } else if (this.approval === ApprovalEnum.REJECTED) {
                return await qmMessageClient.send(this.getConfirmationResultMesssage(this.approval), {id: this.correlationId});
            }

        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(CreateGenericProd.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(CreateGenericProd.RecursiveKeys.projectName, setGluonProjectName);
    }

    private getConfirmationResultMesssage(result: ApprovalEnum) {
        const message = {
            text: `*Prod request status:*`,
            attachments: [],
        };

        if (result === ApprovalEnum.APPROVED) {
            message.attachments.push({
                text: `*Confirmed*`,
                fallback: "*Confirmed*",
                color: "#45B254",
            });
        } else if (result === ApprovalEnum.REJECTED) {
            message.attachments.push({
                text: `*Cancelled*`,
                fallback: "*Cancelled*",
                color: "#D94649",
            });
        }

        return message;
    }

    private async getRequestConfirmation(qmMessageClient: QMMessageClient) {
        await qmMessageClient.send({
            text: "🚀 Finding available resources...",
        });

        await this.findAndListResources(qmMessageClient);

        const message = this.genericProdRequestMessages.confirmProdRequest(this);

        return await qmMessageClient.send(message, {id: this.correlationId});
    }

    private async findAndListResources(qmMessageClient: QMMessageClient) {

        const project = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);

        const tenant = await this.gluonService.tenants.gluonTenantFromTenantId(project.owningTenant);

        await this.ocService.login(QMConfig.subatomic.openshiftNonProd);

        const allResources = await this.ocService.exportAllResources(getProjectId(tenant.name, project.name, getHighestPreProdEnvironment().id));

        const resources = await this.genericOpenshiftResourceService.getAllPromotableResources(
            allResources,
        );

        logger.info(resources);

        this.openShiftResourcesJSON = JSON.stringify(resources.items.map(resource => {
                return {
                    kind: resource.kind,
                    name: resource.metadata.name,
                    resourceDetails: JSON.stringify(resource),
                };
            },
        ));

        return await qmMessageClient.send({
            text: getResourceDisplayMessage(resources),
        });

    }

    private async createGenericProdRequest() {
        const project = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);

        const actionedBy = await this.gluonService.members.gluonMemberFromScreenName(this.screenName, false);

        const openShiftResources = JSON.parse(this.openShiftResourcesJSON);

        const request = {
            project: {
                projectId: project.projectId,
            },
            actionedBy: {
                memberId: actionedBy.memberId,
            },
            openShiftResources,
        };

        logger.info(`Prod request: ${JSON.stringify(request, null, 2)}`);

        await this.gluonService.prod.generic.createGenericProdRequest(request);
    }
}
