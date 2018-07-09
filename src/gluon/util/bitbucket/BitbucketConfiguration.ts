import {logger} from "@atomist/automation-client";
import {AxiosPromise} from "axios-https-proxy-fix";
import * as _ from "lodash";
import {QMConfig} from "../../../config/QMConfig";
import {usernameFromDomainUsername} from "../member/Members";
import {BitbucketService} from "./Bitbucket";

export class BitbucketConfiguration {

    constructor(private owners: string[], private teamMembers: string[], private bitbucketService = new BitbucketService()) {
        logger.debug(`Configuring with team owners: ${JSON.stringify(owners)}`);
        logger.debug(`Configuring with team members: ${JSON.stringify(teamMembers)}`);

        this.owners = this.owners.map(owner => usernameFromDomainUsername(owner));
        this.teamMembers = this.teamMembers.map(member => usernameFromDomainUsername(member));
    }

    public configureBitbucketProject(bitbucketProjectKey: string): Promise<any[]> {
        logger.info(`Configuring project for key: ${bitbucketProjectKey}`);

        return Promise.all([
            this.owners.map(owner => this.addAdminProjectPermission(bitbucketProjectKey, owner)),
            this.teamMembers.map(teamMember => this.addWriteProjectPermission(bitbucketProjectKey, teamMember)),
            this.addBranchPermissions(bitbucketProjectKey, this.owners, [QMConfig.subatomic.bitbucket.auth.username]),
            this.addHooks(bitbucketProjectKey),

            _.zipWith(this.owners, this.teamMembers, (owner, member) => {
                this.bitbucketService.getDefaultReviewers(bitbucketProjectKey)
                    .then(reviewers => {
                        const jsonLength = reviewers.data.length;
                        let reviewerExists = false;

                        for (let i = 0; i < jsonLength; i++) {
                            if (reviewers.data[i].reviewers[0].name === owner) {
                                reviewerExists = true;
                                break;
                            }
                        }
                        if (reviewerExists !== true) {
                            return Promise.all([
                                this.addDefaultReviewers(bitbucketProjectKey, owner),
                                this.addDefaultReviewers(bitbucketProjectKey, member),
                            ]);
                        }
                    });
            }),
        ]);
    }

    private addAdminProjectPermission(projectKey: string, user: string): AxiosPromise {
        return this.bitbucketService.addProjectPermission(projectKey, user, "PROJECT_ADMIN");
    }

    private addWriteProjectPermission(projectKey: string, user: string): AxiosPromise {
        return this.bitbucketService.addProjectPermission(projectKey, user, "PROJECT_WRITE");
    }

    private async addBranchPermissions(bitbucketProjectKey: string, owners: string[], additional: string[] = []) {
        const allUsers = owners.concat(additional);

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

    private addHooks(bitbucketProjectKey: string): Promise<any[]> {
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

    private addDefaultReviewers(bitbucketProjectKey: string, bitbucketUsername: string): AxiosPromise {
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
}
