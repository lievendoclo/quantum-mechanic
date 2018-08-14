import {
    HandlerContext,
    HandlerResult,
    logger,
    success,
} from "@atomist/automation-client";
import {BitBucketServerRepoRef} from "@atomist/automation-client/operations/common/BitBucketServerRepoRef";
import {GitCommandGitProject} from "@atomist/automation-client/project/git/GitCommandGitProject";
import {GitProject} from "@atomist/automation-client/project/git/GitProject";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {QMError} from "../shared/Error";
import {createMenu} from "../shared/GenericMenu";

export const JENKINSFILE_EXISTS_FLAG = "JENKINS_FILE_EXISTS";
const JENKINSFILE_EXTENSION = ".groovy";
const JENKINSFILE_FOLDER = "resources/templates/jenkins/jenkinsfile-repo/";

export async function setJenkinsfileName(
    ctx: HandlerContext,
    commandHandler: JenkinsfileNameSetter,
    selectionMessage: string = "Please select an application",
): Promise<HandlerResult> {

    if (commandHandler.gluonService === undefined) {
        throw new QMError(`setJenkinsfileName commandHandler requires the gluonService parameter to be defined`);
    }

    if (commandHandler.projectName === undefined) {
        throw new QMError(`setJenkinsfileName commandHandler requires the projectName parameter to be defined`);
    }

    if (commandHandler.applicationName === undefined) {
        throw new QMError(`setJenkinsfileName commandHandler requires the applicationName parameter to be defined`);
    }

    const project = await commandHandler.gluonService.projects.gluonProjectFromProjectName(commandHandler.projectName);
    const application = await commandHandler.gluonService.applications.gluonApplicationForNameAndProjectName(commandHandler.applicationName, commandHandler.projectName);
    const username = QMConfig.subatomic.bitbucket.auth.username;
    const password = QMConfig.subatomic.bitbucket.auth.password;
    const gitProject: GitProject = await GitCommandGitProject.cloned({
            username,
            password,
        },
        new BitBucketServerRepoRef(
            QMConfig.subatomic.bitbucket.baseUrl,
            project.bitbucketProject.key,
            application.bitbucketRepository.name));
    try {
        await gitProject.findFile("Jenkinsfile");
        commandHandler.jenkinsfileName = JENKINSFILE_EXISTS_FLAG;
        return success();
    } catch (error) {
        return await createMenuForJenkinsFileSelection(ctx, commandHandler, selectionMessage);
    }
}

async function createMenuForJenkinsFileSelection(ctx: HandlerContext, commandHandler, selectionDescriptionMessage: string): Promise<HandlerResult> {
    logger.info("Jenkinsfile does not exist. Requesting jenkinsfile selection.");
    const fs = require("fs");
    const jenkinsfileOptions: string [] = [];
    logger.info(`Searching folder: ${JENKINSFILE_FOLDER}`);
    fs.readdirSync(JENKINSFILE_FOLDER).forEach(file => {
        logger.info(`Found file: ${file}`);
        if (file.endsWith(JENKINSFILE_EXTENSION)) {
            jenkinsfileOptions.push(getNameFromJenkinsfilePath(file));
        }
    });
    return await createMenu(ctx, jenkinsfileOptions.map(jenkinsfile => {
            return {
                value: jenkinsfile,
                text: jenkinsfile,
            };
        }),
        commandHandler,
        selectionDescriptionMessage,
        "Select a jenkinsfile",
        "jenkinsfileName");
}

function getNameFromJenkinsfilePath(jenkinsfilePath: string): string {
    const jenkinsfileSlashSplit = jenkinsfilePath.split("/");
    let name = jenkinsfileSlashSplit[jenkinsfileSlashSplit.length - 1];
    // Remove file extension
    name = name.substring(0, jenkinsfilePath.length - JENKINSFILE_EXTENSION.length);
    return name;
}

export interface JenkinsfileNameSetter {
    gluonService: GluonService;
    projectName: string;
    applicationName: string;
    jenkinsfileName: string;
    handle: (ctx: HandlerContext) => Promise<HandlerResult>;
}
