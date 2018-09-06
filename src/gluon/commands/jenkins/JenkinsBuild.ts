import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
} from "@atomist/automation-client";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {isSuccessCode} from "../../../http/Http";
import {GluonService} from "../../services/gluon/GluonService";
import {JenkinsService} from "../../services/jenkins/JenkinsService";
import {OCService} from "../../services/openshift/OCService";
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
import {
    handleQMError,
    QMError,
    ResponderMessageClient,
} from "../../util/shared/Error";

@CommandHandler("Kick off a Jenkins build", QMConfig.subatomic.commandPrefix + " jenkins build")
export class KickOffJenkinsBuild extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter, GluonProjectNameSetter, GluonApplicationNameSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        projectName: "PROJECT_NAME",
        applicationName: "APPLICATION_NAME",
    };

    @MappedParameter(MappedParameters.SlackUser)
    public slackName: string;

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @RecursiveParameter({
        recursiveKey: KickOffJenkinsBuild.RecursiveKeys.projectName,
        selectionMessage: "Please select a project which contains the application you would like to build",
    })
    public projectName: string;

    @RecursiveParameter({
        recursiveKey: KickOffJenkinsBuild.RecursiveKeys.teamName,
        selectionMessage: "Please select the team which contains the owning project of the application you would like to build",
    })
    public teamName: string;

    @RecursiveParameter({
        recursiveKey: KickOffJenkinsBuild.RecursiveKeys.applicationName,
        selectionMessage: "Please select the application you would like to build",
    })
    public applicationName: string;

    constructor(public gluonService = new GluonService(),
                private jenkinsService = new JenkinsService(),
                private ocService = new OCService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext) {
        try {
            await this.ocService.login();
            return await this.applicationsForGluonProject(ctx, this.applicationName, this.teamName, this.projectName);
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(KickOffJenkinsBuild.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(KickOffJenkinsBuild.RecursiveKeys.projectName, setGluonProjectName);
        this.addRecursiveSetter(KickOffJenkinsBuild.RecursiveKeys.applicationName, setGluonApplicationName);
    }

    private async applicationsForGluonProject(ctx: HandlerContext,
                                              gluonApplicationName: string,
                                              gluonTeamName: string,
                                              gluonProjectName: string): Promise<HandlerResult> {
        logger.debug(`Kicking off build for application: ${gluonApplicationName}`);

        const teamDevOpsProjectId = `${_.kebabCase(gluonTeamName).toLowerCase()}-devops`;
        const token = await this.ocService.getServiceAccountToken("subatomic-jenkins", teamDevOpsProjectId);

        const jenkinsHost = await this.ocService.getJenkinsHost(teamDevOpsProjectId);

        logger.debug(`Using Jenkins Route host [${jenkinsHost.output}] to kick off build`);

        const kickOffBuildResult = await this.jenkinsService.kickOffBuild(
            jenkinsHost.output,
            token,
            gluonProjectName,
            gluonApplicationName,
        );
        if (isSuccessCode(kickOffBuildResult.status)) {
            return await ctx.messageClient.respond({
                text: `🚀 *${gluonApplicationName}* is being built...`,
            });
        } else {
            if (kickOffBuildResult.status === 404) {
                logger.warn(`This is probably the first build and therefore a master branch job does not exist`);
                await this.jenkinsService.kickOffFirstBuild(
                    jenkinsHost.output,
                    token,
                    gluonProjectName,
                    gluonApplicationName,
                );
                return await ctx.messageClient.respond({
                    text: `🚀 *${gluonApplicationName}* is being built for the first time...`,
                });
            } else {
                logger.error(`Failed to kick off JenkinsBuild. Error: ${JSON.stringify(kickOffBuildResult)}`);
                throw new QMError("Failed to kick off jenkins build. Network failure connecting to Jenkins instance.");
            }
        }
    }
}
