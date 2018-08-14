import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    logger,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import {QMConfig} from "../../../config/QMConfig";
import {BitbucketService} from "../../services/bitbucket/BitbucketService";
import {GluonService} from "../../services/gluon/GluonService";
import {PackageCommandService} from "../../services/packages/PackageCommandService";
import {ApplicationType} from "../../util/packages/Applications";
import {
    BitbucketRepoSetter,
    setBitbucketRepository,
} from "../../util/recursiveparam/BitbucketParamSetters";
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

@CommandHandler("Link an existing application", QMConfig.subatomic.commandPrefix + " link application")
export class LinkExistingApplication extends RecursiveParameterRequestCommand
    implements GluonTeamNameSetter, GluonProjectNameSetter, BitbucketRepoSetter {

    private static RecursiveKeys = {
        teamName: "TEAM_NAME",
        projectName: "PROJECT_NAME",
        bitbucketRepositorySlug: "BITBUCKET_REPOSITORY_SLUG",
    };

    @MappedParameter(MappedParameters.SlackUserName)
    public screenName: string;

    @MappedParameter(MappedParameters.SlackChannelName)
    public teamChannel: string;

    @Parameter({
        description: "application name",
    })
    public name: string;

    @Parameter({
        description: "application description",
    })
    public description: string;

    @RecursiveParameter({
        recursiveKey: LinkExistingApplication.RecursiveKeys.teamName,
        forceSet: false,
        selectionMessage: "Please select a team, whose project you would like to link an application to",
    })
    public teamName: string;

    @RecursiveParameter({
        recursiveKey: LinkExistingApplication.RecursiveKeys.projectName,
        selectionMessage: "Please select a project to which you would like to link an application to",
    })
    public projectName: string;

    @RecursiveParameter({
        recursiveKey: LinkExistingApplication.RecursiveKeys.bitbucketRepositorySlug,
        selectionMessage: "Please select the Bitbucket repository which contains the application you want to link",
    })
    public bitbucketRepositorySlug: string;

    constructor(public gluonService = new GluonService(),
                public bitbucketService = new BitbucketService(),
                private packageCommandService = new PackageCommandService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {

        logger.debug(`Linking to Gluon project: ${this.projectName}`);

        try {
            await ctx.messageClient.respond({
                text: "🚀 Your new application is being created...",
            });

            return await this.packageCommandService.linkBitbucketRepoToGluonPackage(
                this.screenName,
                this.name,
                this.description,
                this.bitbucketRepositorySlug,
                this.projectName,
                ApplicationType.DEPLOYABLE,
            );
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(LinkExistingApplication.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(LinkExistingApplication.RecursiveKeys.projectName, setGluonProjectName);
        this.addRecursiveSetter(LinkExistingApplication.RecursiveKeys.bitbucketRepositorySlug, setBitbucketRepository);
    }
}
