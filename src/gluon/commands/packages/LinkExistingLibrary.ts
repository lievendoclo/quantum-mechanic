import {
    CommandHandler,
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "@atomist/automation-client";
import {addressSlackChannelsFromContext} from "@atomist/automation-client/spi/message/MessageClient";
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

@CommandHandler("Link an existing library", QMConfig.subatomic.commandPrefix + " link library")
export class LinkExistingLibrary extends RecursiveParameterRequestCommand
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
        description: "library name",
    })
    public name: string;

    @Parameter({
        description: "library description",
    })
    public description: string;

    @RecursiveParameter({
        recursiveKey: LinkExistingLibrary.RecursiveKeys.teamName,
        forceSet: false,
        selectionMessage: "Please select a team, whose project you would like to link a library to",
    })
    public teamName: string;

    @RecursiveParameter({
        recursiveKey: LinkExistingLibrary.RecursiveKeys.projectName,
        selectionMessage: "Please select a project to which you would like to link a library to",
    })
    public projectName: string;

    @RecursiveParameter({
        recursiveKey: LinkExistingLibrary.RecursiveKeys.bitbucketRepositorySlug,
        selectionMessage: "Please select the Bitbucket repository which contains the library you want to link",
    })
    public bitbucketRepositorySlug: string;

    constructor(public gluonService = new GluonService(),
                public bitbucketService = new BitbucketService(),
                private packageCommandService = new PackageCommandService()) {
        super();
    }

    protected async runCommand(ctx: HandlerContext): Promise<HandlerResult> {
        try {
            const destination =  await addressSlackChannelsFromContext(ctx, this.teamChannel);
            await ctx.messageClient.send({
                text: "🚀 Your new library is being created...",
            }, destination);

            return await this.packageCommandService.linkBitbucketRepoToGluonPackage(
                this.screenName,
                this.name,
                this.description,
                this.bitbucketRepositorySlug,
                this.projectName,
                ApplicationType.LIBRARY,
            );
        } catch (error) {
            return await handleQMError(new ResponderMessageClient(ctx), error);
        }
    }

    protected configureParameterSetters() {
        this.addRecursiveSetter(LinkExistingLibrary.RecursiveKeys.teamName, setGluonTeamName);
        this.addRecursiveSetter(LinkExistingLibrary.RecursiveKeys.projectName, setGluonProjectName);
        this.addRecursiveSetter(LinkExistingLibrary.RecursiveKeys.bitbucketRepositorySlug, setBitbucketRepository);
    }
}
