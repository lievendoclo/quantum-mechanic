import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
    success,
} from "@atomist/automation-client";
import axios from "axios";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {gluonMemberFromScreenName} from "../member/Members";
import {
    gluonProjectFromProjectName,
    gluonProjectsWhichBelongToGluonTeam,
    menuForProjects,
} from "../project/Projects";
import {handleQMError, QMError, ResponderMessageClient} from "../shared/Error";
import {isSuccessCode} from "../shared/Http";
import {
    RecursiveParameter,
    RecursiveParameterRequestCommand,
} from "../shared/RecursiveParameterRequestCommand";
import {
    gluonTeamForSlackTeamChannel,
    gluonTeamsWhoSlackScreenNameBelongsTo,
    menuForTeams,
} from "../team/Teams";
import {bitbucketAxios} from "./Bitbucket";

@CommandHandler("Create a new Bitbucket project", QMConfig.subatomic.commandPrefix + " create bitbucket project")
export class NewBitbucketProject extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "bitbucket project key",
    })
    public bitbucketProjectKey: string;

    @RecursiveParameter({
        description: "project name",
    })
    public projectName: string;

    @Parameter({
        description: "team name",
        displayable: false,
        required: false,
    })
    public teamName: string;

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Team: ${this.teamName}, Project: ${this.projectName}`);

        try {
            const member = await gluonMemberFromScreenName(ctx, this.screenName);

            const project = await gluonProjectFromProjectName(ctx, this.projectName);

            await this.updateGluonWithBitbucketDetails(project.projectId, this.projectName, project.description, member.memberId);

            return await success();
        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    protected async setNextParameter(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
            logger.info("Team name is empty");
            try {
                const team = await gluonTeamForSlackTeamChannel(this.teamChannel);
                this.teamName = team.name;
                return await this.handle(ctx);
            } catch (error) {
                const teams = await gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName);
                return await menuForTeams(
                    ctx,
                    teams,
                    this,
                    "Please select a team associated with the project you wish to create a Bitbucket project for",
                );
            }
        }
        if (_.isEmpty(this.projectName)) {
            logger.info("Project name is empty");
            const projects = await gluonProjectsWhichBelongToGluonTeam(ctx, this.teamName);
            return await menuForProjects(
                ctx,
                projects,
                this,
                "Please select the project you wish to create a Bitbucket project for",
            );
        }
    }

    private async updateGluonWithBitbucketDetails(projectId: string, projectName: string, projectDescription: string, memberId: string) {
        const updateGluonProjectResult = await axios.put(`${QMConfig.subatomic.gluon.baseUrl}/projects/${projectId}`,
            {
                bitbucketProject: {
                    name: projectName,
                    description: `${projectDescription} [managed by Subatomic]`,
                },
                createdBy: memberId,
            });
        if (!isSuccessCode(updateGluonProjectResult.status)) {
            logger.error(`Unable to register Bitbucket project in gluon. Error ${updateGluonProjectResult.data}`);
            throw new QMError("Failed to update the Subatomic project with specified Bitbucket details.");
        }
    }

    private async handleError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }
}

@CommandHandler("Link an existing Bitbucket project", QMConfig.subatomic.commandPrefix + " link bitbucket project")
export class ListExistingBitbucketProject extends RecursiveParameterRequestCommand {

    @MappedParameter(MappedParameters.SlackUser)
    public slackName: string;

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "bitbucket project key",
    })
    public bitbucketProjectKey: string;

    @RecursiveParameter({
        description: "project name",
    })
    public projectName: string;

    @Parameter({
        description: "team name",
        displayable: false,
        required: false,
    })
    public teamName: string;

    protected async runCommand(ctx: HandlerContext) {
        try {
            return await this.configBitbucket(ctx);
        } catch (error) {
            return await this.handleError(ctx, error);
        }
    }

    protected async setNextParameter(ctx: HandlerContext): Promise<HandlerResult> {
        if (_.isEmpty(this.teamName)) {
            logger.info("Team name is empty");
            try {
                const team = await gluonTeamForSlackTeamChannel(this.teamChannel);
                this.teamName = team.name;
                return await this.handle(ctx);
            } catch (error) {
                const teams = await gluonTeamsWhoSlackScreenNameBelongsTo(ctx, this.screenName);
                return await menuForTeams(
                    ctx,
                    teams,
                    this,
                    "Please select a team associated with the project you wish to link a Bitbucket project to",
                );
            }
        }
        if (_.isEmpty(this.projectName)) {
            logger.info("Project name is empty");
            const projects = await gluonProjectsWhichBelongToGluonTeam(ctx, this.teamName);

            return await menuForProjects(
                ctx,
                projects,
                this,
                "Please select the project you wish to link a Bitbucket project to",
            );
        }
    }

    private async configBitbucket(ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Team: ${this.teamName}, Project: ${this.projectName}`);

        const member = await gluonMemberFromScreenName(ctx, this.screenName);
        const gluonProject = await gluonProjectFromProjectName(ctx, this.projectName);

        const projectRestUrl = `${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${this.bitbucketProjectKey}`;
        const projectUiUrl = `${QMConfig.subatomic.bitbucket.baseUrl}/projects/${this.bitbucketProjectKey}`;

        await ctx.messageClient.addressChannels({
            text: `🚀 The Bitbucket project with key ${this.bitbucketProjectKey} is being configured...`,
        }, this.teamChannel);

        const bitbucketProject = await this.getBitbucketProject(projectRestUrl);

        await this.updateGluonProjectWithBitbucketDetails(projectUiUrl, member.memberId, gluonProject, bitbucketProject);

        return await success();
    }

    private async getBitbucketProject(bitbucketProjectRestUrl: string) {
        const bitbucketProjectRequestResult = await bitbucketAxios().get(bitbucketProjectRestUrl);

        if (!isSuccessCode(bitbucketProjectRequestResult.status)) {
            throw new QMError("Unable find the specified project in Bitbucket. Please make sure it exists.");
        }

        return bitbucketProjectRequestResult.data;
    }

    private async updateGluonProjectWithBitbucketDetails(bitbucketProjectUiUrl: string, createdByMemberId: string, gluonProject, bitbucketProject) {
        const updateGluonProjectResult = await axios.put(`${QMConfig.subatomic.gluon.baseUrl}/projects/${gluonProject.projectId}`,
            {
                bitbucketProject: {
                    bitbucketProjectId: bitbucketProject.id,
                    name: bitbucketProject.name,
                    description: bitbucketProject.description,
                    key: this.bitbucketProjectKey,
                    url: bitbucketProjectUiUrl,
                },
                createdBy: createdByMemberId,
            });

        if (!isSuccessCode(updateGluonProjectResult.status)) {
            throw new QMError(`Failed to update the Subatomic project with specified Bibucket details.`);
        }
    }

    private async handleError(ctx: HandlerContext, error) {
        const messageClient = new ResponderMessageClient(ctx);
        return await handleQMError(messageClient, error);
    }
}
