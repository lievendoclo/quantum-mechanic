import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    Tags,
} from "@atomist/automation-client";
import {v4 as uuid} from "uuid";
import {QMConfig} from "../../../config/QMConfig";
import {ApplicationProdRequestMessages} from "../../messages/package/ApplicationProdRequestMessages";
import {GluonService} from "../../services/gluon/GluonService";
import {OCService} from "../../services/openshift/OCService";
import {PackageOpenshiftResourceService} from "../../services/packages/PackageOpenshiftResourceService";
import {
    getHighestPreProdEnvironment,
    getResourceDisplayMessage,
} from "../../util/openshift/Helpers";
import {getProjectId} from "../../util/project/Project";
import {
    GluonApplicationNameSetter,
    GluonProjectNameSetter,
    GluonTeamNameSetter,
    setGluonApplicationName,
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

@CommandHandler("Create application in prod", QMConfig.subatomic.commandPrefix + " request application prod")
@Tags("subatomic", "package")
export class CreateApplicationProd extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter, GluonProjectNameSetter, GluonApplicationNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        applicationName: "APPLICATION_NAME",
        projectName: "PROJECT_NAME",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        recursiveKey: CreateApplicationProd.RecursiveKeys.teamName,
        selectionMessage: "Please select a team associated with the project you wish to configure the package for",
    })
    public teamName: string;

    @RecursiveParameter({
        recursiveKey: CreateApplicationProd.RecursiveKeys.applicationName,
        selectionMessage: "Please select the package you wish to configure",
    })
    public applicationName: string;

    @RecursiveParameter({
        recursiveKey: CreateApplicationProd.RecursiveKeys.projectName,
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

    private applicationProdRequestMessages = new ApplicationProdRequestMessages();

    constructor(public gluonService = new GluonService(), public ocService = new OCService(), public packageOpenshiftResourceService = new PackageOpenshiftResourceService()) {
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

                await this.createApplicationProdRequest();

                return await qmMessageClient.send(this.getConfirmationResultMesssage(this.approval), {id: this.correlationId});
            } else if (this.approval === ApprovalEnum.REJECTED) {
                return await qmMessageClient.send(this.getConfirmationResultMesssage(this.approval), {id: this.correlationId});
            }

        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(CreateApplicationProd.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(CreateApplicationProd.RecursiveKeys.projectName, setGluonProjectName);
        this.addRecursiveSetter(CreateApplicationProd.RecursiveKeys.applicationName, setGluonApplicationName);
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

        const message = this.applicationProdRequestMessages.confirmProdRequest(this);

        return await qmMessageClient.send(message, {id: this.correlationId});
    }

    private async findAndListResources(qmMessageClient: QMMessageClient) {

        const project = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);

        const tenant = await this.gluonService.tenants.gluonTenantFromTenantId(project.owningTenant);

        await this.ocService.login(QMConfig.subatomic.openshiftNonProd);

        const allResources = await this.ocService.exportAllResources(getProjectId(tenant.name, project.name, getHighestPreProdEnvironment().id));

        const resources = await this.packageOpenshiftResourceService.getAllApplicationRelatedResources(
            this.applicationName,
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

    private async createApplicationProdRequest() {
        const project = await this.gluonService.projects.gluonProjectFromProjectName(this.projectName);

        const application = await this.gluonService.applications.gluonApplicationForNameAndProjectName(this.applicationName, project.name);

        const actionedBy = await this.gluonService.members.gluonMemberFromScreenName(this.screenName, false);

        const openShiftResources = JSON.parse(this.openShiftResourcesJSON);

        const request = {
            applicationId: application.applicationId,
            actionedBy: actionedBy.memberId,
            openShiftResources,
        };

        await this.gluonService.prod.application.createApplicationProdRequest(request);
    }
}
