import {logger} from "@atomist/automation-client";
import {AxiosPromise} from "axios-https-proxy-fix";
import * as _ from "lodash";
import {QMError} from "../../util/shared/Error";
import {BitbucketService} from "./BitbucketService";

export class BitbucketConfigurationService {

    constructor(private bitbucketService = new BitbucketService()) {
    }

    public async addAllMembersToProject(projectKey: string, membersDomainUsernames: string[]) {
        for (const member of membersDomainUsernames) {
            await this.addWriteProjectPermission(projectKey, member);
        }
    }

    public async addAllOwnersToProject(projectKey: string, ownersDomainUsernames: string[]) {
        for (const owner of ownersDomainUsernames) {
            await this.addAdminProjectPermission(projectKey, owner);
        }
    }

    public async removeUserFromBitbucketProject(bitbucketProjectKey: string, membersDomainUsernames: string[]) {
        logger.info(`Trying to remove user from BitBucket project: ${bitbucketProjectKey}`);
        try {
            return membersDomainUsernames.map(teamMember => this.bitbucketService.removeProjectPermission(bitbucketProjectKey, teamMember));
        } catch (error) {
            throw new QMError(error, `Failed to remove BitBucket permissions for user`);
        }
    }

    public async addBranchPermissions(bitbucketProjectKey: string, ownersDomainUsernames: string[], additionalUserDomainUsernames: string[] = []) {

        const allUsers = ownersDomainUsernames.concat(additionalUserDomainUsernames);

        await this.bitbucketService.addBranchPermissions(bitbucketProjectKey,
            {
                type: "fast-forward-only",
                matcher: {
                    id: "master",
                    displayId: "master",
                    type: {
                        id: "BRANCH",
                        name: "Branch",
                    },
                },
                users: allUsers,
            });

        await this.bitbucketService.addBranchPermissions(bitbucketProjectKey,
            {
                type: "no-deletes",
                matcher: {
                    id: "master",
                    displayId: "master",
                    type: {
                        id: "BRANCH",
                        name: "Branch",
                    },
                },
                users: allUsers,
            });

        await this.bitbucketService.addBranchPermissions(bitbucketProjectKey,
            {
                type: "pull-request-only",
                matcher: {
                    id: "master",
                    displayId: "master",
                    type: {
                        id: "BRANCH",
                        name: "Branch",
                    },
                },
                users: allUsers,
            });
    }

    public addHooks(bitbucketProjectKey: string): Promise<any[]> {
        // Enable and configure hooks
        return Promise.all([
            this.bitbucketService.addProjectWebHook(bitbucketProjectKey, "com.atlassian.bitbucket.server.bitbucket-bundled-hooks:verify-committer-hook"),
            // Enable and configure hooks
            this.bitbucketService.addProjectWebHook(bitbucketProjectKey, "com.atlassian.bitbucket.server.bitbucket-bundled-hooks:incomplete-tasks-merge-check"),
            // Enable and configure merge checks
            this.bitbucketService.addProjectWebHook(bitbucketProjectKey, "com.atlassian.bitbucket.server.bitbucket-build:requiredBuildsMergeCheck", {
                requiredCount: 1,
            }),
        ]);
    }

    public async addDefaultReviewers(bitbucketProjectKey: string, membersDomainUsernames: string[], ownersDomainUsernames: string[]) {
        return await _.zipWith(ownersDomainUsernames, membersDomainUsernames, async (owner, member) => {
            const reviewers = await this.bitbucketService.getDefaultReviewers(bitbucketProjectKey);
            const jsonLength = reviewers.data.length;
            let reviewerExists = false;

            for (let i = 0; i < jsonLength; i++) {
                if (reviewers.data[i].reviewers[0].name === owner) {
                    reviewerExists = true;
                    break;
                }
            }
            if (reviewerExists !== true) {
                if (owner !== undefined) {
                    await this.addUserAsDefaultReviewer(bitbucketProjectKey, owner);
                }
                if (member !== undefined) {
                    await this.addUserAsDefaultReviewer(bitbucketProjectKey, member);
                }
            }
        });
    }

    private addUserAsDefaultReviewer(bitbucketProjectKey: string, bitbucketUsername: string): AxiosPromise {
        logger.debug(`Adding default reviewer [${bitbucketUsername}] to Bitbucket project: ${bitbucketProjectKey}`);

        // TODO Add default reviewers (the team owners - in future everyone with 'reviewer' role?)

        if (!_.isEmpty(bitbucketUsername)) {
            return this.bitbucketService.bitbucketUserFromUsername(bitbucketUsername)
                .then(user => {
                    logger.debug(`Adding to the default reviewers the Bitbucket user: ${JSON.stringify(user.data)}`);
                    return this.bitbucketService.addDefaultReviewers(bitbucketProjectKey,
                        {
                            reviewers: [
                                {
                                    id: user.data.values[0].id,
                                },
                            ],
                            sourceMatcher: {
                                id: "ANY_REF_MATCHER_ID",
                                displayId: "ANY_REF_MATCHER_ID",
                                type: {
                                    id: "ANY_REF",
                                    name: "Any branch",
                                },
                            },
                            targetMatcher: {
                                id: "ANY_REF_MATCHER_ID",
                                displayId: "ANY_REF_MATCHER_ID",
                                type: {
                                    id: "ANY_REF",
                                    name: "Any branch",
                                },
                            },
                            requiredApprovals: 0,
                        });
                });
        }
    }

    private addAdminProjectPermission(projectKey: string, userDomainUsername: string): AxiosPromise {
        return this.bitbucketService.addProjectPermission(projectKey, userDomainUsername, "PROJECT_ADMIN");
    }

    private addWriteProjectPermission(projectKey: string, userDomainUsername: string): AxiosPromise {
        return this.bitbucketService.addProjectPermission(projectKey, userDomainUsername, "PROJECT_WRITE");
    }

}
