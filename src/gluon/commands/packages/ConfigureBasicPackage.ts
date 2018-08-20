import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
} from "@atomist/automation-client";
import {QMConfig} from "../../../config/QMConfig";
import {QMTemplate} from "../../../template/QMTemplate";
import {GluonService} from "../../services/gluon/GluonService";
import {PackageDefinition} from "../../util/packages/PackageDefinition";
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
import {handleQMError, ResponderMessageClient} from "../../util/shared/Error";
import {createMenu} from "../../util/shared/GenericMenu";
import {ConfigurePackage} from "./ConfigurePackage";

const PACKAGE_DEFINITION_EXTENSION = ".json";
const PACKAGE_DEFINITION_FOLDER = "resources/package-definitions/";

@CommandHandler("Configure an existing application/library using a predefined template", QMConfig.subatomic.commandPrefix + " configure package")
export class ConfigureBasicPackage extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter, GluonProjectNameSetter, GluonApplicationNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        applicationName: "APPLICATION_NAME",
        projectName: "PROJECT_NAME",
        packageType: "PACKAGE_TYPE",
        packageDefinition: "PACKAGE_DEFINITION",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        recursiveKey: ConfigureBasicPackage.RecursiveKeys.teamName,
        selectionMessage: "Please select a team associated with the project you wish to configure the package for",
    })
    public teamName: string;

    @RecursiveParameter({
        recursiveKey: ConfigureBasicPackage.RecursiveKeys.applicationName,
        selectionMessage: "Please select the package you wish to configure",
    })
    public applicationName: string;

    @RecursiveParameter({
        recursiveKey: ConfigureBasicPackage.RecursiveKeys.projectName,
        selectionMessage: "Please select the owning project of the package you wish to configure",
    })
    public projectName: string;

    @RecursiveParameter({
        recursiveKey: ConfigureBasicPackage.RecursiveKeys.packageType,
    })
    public packageType: string;

    @RecursiveParameter({
        recursiveKey: ConfigureBasicPackage.RecursiveKeys.packageDefinition,
        selectionMessage: "Please select a package definition to use for your project",
    })
    public packageDefinition: string;

    constructor(public gluonService = new GluonService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            return await this.callPackageConfiguration(ctx);
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(ConfigureBasicPackage.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(ConfigureBasicPackage.RecursiveKeys.projectName, setGluonProjectName);
        this.addRecursiveSetter(ConfigureBasicPackage.RecursiveKeys.applicationName, setGluonApplicationName);
        this.addRecursiveSetter(ConfigureBasicPackage.RecursiveKeys.packageType, setPackageType);
        this.addRecursiveSetter(ConfigureBasicPackage.RecursiveKeys.packageDefinition, setPackageDefinitionFile);
    }

    private async callPackageConfiguration(ctx: HandlerContext): Promise<HandlerResult> {
        const configTemplate: QMTemplate = new QMTemplate(this.getPathFromDefinitionName(this.packageDefinition));
        const definition: PackageDefinition = JSON.parse(configTemplate.build(QMConfig.publicConfig()));

        const configurePackage = new ConfigurePackage();
        configurePackage.screenName = this.screenName;
        configurePackage.teamChannel = this.teamChannel;
        configurePackage.openshiftTemplate = definition.openshiftTemplate || "Default";
        configurePackage.jenkinsfileName = definition.jenkinsfile;
        configurePackage.baseS2IImage = definition.buildConfig.imageStream;
        if (definition.buildConfig.envVariables != null) {
            configurePackage.buildEnvironmentVariables = definition.buildConfig.envVariables;
        }
        configurePackage.applicationName = this.applicationName;
        configurePackage.teamName = this.teamName;
        configurePackage.projectName = this.projectName;

        return await configurePackage.handle(ctx);
    }

    private getPathFromDefinitionName(definitionName: string): string {
        return `${PACKAGE_DEFINITION_FOLDER}${this.packageType.toLowerCase()}/${definitionName}${PACKAGE_DEFINITION_EXTENSION}`;
    }
}

async function setPackageType(ctx: HandlerContext, commandHandler: ConfigureBasicPackage) {
    const application = await commandHandler.gluonService.applications.gluonApplicationForNameAndProjectName(commandHandler.applicationName, commandHandler.projectName, false);
    commandHandler.packageType = application.applicationType;
    return await commandHandler.handle(ctx);
}

async function setPackageDefinitionFile(ctx: HandlerContext, commandHandler: ConfigureBasicPackage, selectionMessage: string): Promise<HandlerResult> {
    const packageDefinitionOptions: string [] = readPackageDefinitions(commandHandler.packageType);
    return await createMenu(ctx, packageDefinitionOptions.map(packageDefinition => {
            return {
                value: packageDefinition,
                text: packageDefinition,
            };
        }),
        commandHandler,
        selectionMessage,
        "Select a package definition",
        "packageDefinition");
}

function readPackageDefinitions(packageType: string) {
    const fs = require("fs");
    const packageDefinitionOptions: string [] = [];
    logger.info(`Searching folder: ${PACKAGE_DEFINITION_FOLDER}${packageType.toLowerCase()}/`);
    fs.readdirSync(`${PACKAGE_DEFINITION_FOLDER}${packageType.toLowerCase()}/`).forEach(file => {
        logger.info(`Found file: ${file}`);
        if (file.endsWith(PACKAGE_DEFINITION_EXTENSION)) {
            packageDefinitionOptions.push(getNameFromDefinitionPath(file));
        }
    });
    return packageDefinitionOptions;
}

function getNameFromDefinitionPath(definitionPath: string): string {
    const definitionSlashSplit = definitionPath.split("/");
    let name = definitionSlashSplit[definitionSlashSplit.length - 1];
    // Remove file extension
    name = name.substring(0, definitionPath.length - PACKAGE_DEFINITION_EXTENSION.length);
    return name;
}
