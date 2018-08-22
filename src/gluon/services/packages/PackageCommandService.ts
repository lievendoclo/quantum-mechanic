import {HandlerResult, logger, success} from "@atomist/automation-client";
import * as _ from "lodash";
import {inspect} from "util";
import {ApplicationType} from "../../util/packages/Applications";
import {QMError} from "../../util/shared/Error";
import {isSuccessCode} from "../../util/shared/Http";
import {BitbucketService} from "../bitbucket/BitbucketService";
import {GluonService} from "../gluon/GluonService";

export class PackageCommandService {

    constructor(private gluonService = new GluonService(),
                private bitbucketService = new BitbucketService()) {
    }

    public async linkBitbucketRepoToGluonPackage(slackScreeName: string,
                                                 packageName: string,
                                                 packageDescription: string,
                                                 bitbucketRepositorySlug: string,
                                                 gluonProjectName: string,
                                                 applicationType: ApplicationType): Promise<HandlerResult> {
        const project = await this.gluonService.projects.gluonProjectFromProjectName(gluonProjectName);
        logger.debug(`Linking Bitbucket repository: ${bitbucketRepositorySlug}`);

        const repo = await this.getBitbucketRepo(project.bitbucketProject.key, bitbucketRepositorySlug);

        const remoteUrl = _.find(repo.links.clone, clone => {
            return (clone as any).name === "ssh";
        }) as any;

        const member = await this.gluonService.members.gluonMemberFromScreenName(slackScreeName);

        return await this.linkBitbucketRepository(
            member.memberId,
            packageName,
            packageDescription,
            bitbucketRepositorySlug,
            repo,
            remoteUrl.href,
            project.projectId,
            applicationType);
    }

    private async linkBitbucketRepository(memberId: string,
                                          libraryName: string,
                                          libraryDescription: string,
                                          bitbucketRepositorySlug: string,
                                          repo: any,
                                          remoteUrlHref: string,
                                          gluonProjectId: string,
                                          applicationType: ApplicationType): Promise<HandlerResult> {

        const createApplicationResult = await this.gluonService.applications.createGluonApplication(
            {
                name: libraryName,
                description: libraryDescription,
                applicationType,
                projectId: gluonProjectId,
                createdBy: memberId,
                bitbucketRepository: {
                    bitbucketId: repo.id,
                    name: repo.name,
                    slug: bitbucketRepositorySlug,
                    remoteUrl: remoteUrlHref,
                    repoUrl: repo.links.self[0].href,
                },
                requestConfiguration: true,
            });

        if (createApplicationResult.status === 409) {
            logger.error(`Failed to create application since the name of the application is already in use.`);
            throw new QMError(`Failed to create application since the name of the application is already in use. Please retry using a different name.`);
        } else if (!isSuccessCode(createApplicationResult.status)) {
            logger.error(`Failed to link package. Error: ${inspect(createApplicationResult)}`);
            throw new QMError("Failed to link the specified package from bitbucket.");
        }

        return await success();
    }

    private async getBitbucketRepo(bitbucketProjectKey, bitbucketRepositorySlug) {
        const repoResult = await this.bitbucketService.bitbucketRepositoryForSlug(bitbucketProjectKey, bitbucketRepositorySlug);

        if (!isSuccessCode(repoResult.status)) {
            throw new QMError("Unable to find the specified repository in Bitbucket. Please make sure it exists.");
        }

        return repoResult.data;
    }
}
