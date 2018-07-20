import {HandlerResult, logger, success} from "@atomist/automation-client";
import * as _ from "lodash";
import {BitbucketService} from "../bitbucket/Bitbucket";
import {MemberService} from "../member/Members";
import {ProjectService} from "../project/ProjectService";
import {QMError} from "../shared/Error";
import {isSuccessCode} from "../shared/Http";
import {ApplicationService, ApplicationType} from "./Applications";

export class PackageCommandService {

    constructor(private projectService = new ProjectService(),
                private bitbucketService = new BitbucketService(),
                private applicationService = new ApplicationService(),
                private memberService = new MemberService()) {
    }

    public async linkBitbucketRepoToGluonPackage(slackScreeName: string,
                                                 packageName: string,
                                                 packageDescription: string,
                                                 bitbucketRepositorySlug: string,
                                                 gluonProjectName: string,
                                                 applicationType: ApplicationType): Promise<HandlerResult> {
        const project = await this.projectService.gluonProjectFromProjectName(gluonProjectName);
        logger.debug(`Linking Bitbucket repository: ${bitbucketRepositorySlug}`);

        const repo = await this.getBitbucketRepo(project.bitbucketProject.key, bitbucketRepositorySlug);

        const remoteUrl = _.find(repo.links.clone, clone => {
            return (clone as any).name === "ssh";
        }) as any;

        const member = await this.memberService.gluonMemberFromScreenName(slackScreeName);

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

        const createApplicationResult = await this.applicationService.createGluonApplication(
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

        if (!isSuccessCode(createApplicationResult.status)) {
            logger.error(`Failed to link package. Error: ${JSON.stringify(createApplicationResult)}`);
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
