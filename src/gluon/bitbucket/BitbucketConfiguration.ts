import {logger} from "@atomist/automation-client";
import {AxiosInstance, AxiosPromise} from "axios-https-proxy-fix";
import * as _ from "lodash";
import {QMConfig} from "../../config/QMConfig";
import {usernameFromDomainUsername} from "../member/Members";
import {bitbucketAxios, bitbucketUserFromUsername} from "./Bitbucket";

export class BitbucketConfiguration {

    private axios: AxiosInstance = bitbucketAxios();

    constructor(private owners: string[], private teamMembers: string[]) {
        logger.debug(`Configuring with team owners: ${JSON.stringify(owners)}`);
        logger.debug(`Configuring with team members: ${JSON.stringify(teamMembers)}`);

        this.owners = this.owners.map(owner => usernameFromDomainUsername(owner));
        this.teamMembers = this.teamMembers.map(member => usernameFromDomainUsername(member));
    }

    public configureBitbucketProject(bitbucketProjectKey: string): Promise<[any]> {
        logger.info(`Configuring project for key: ${bitbucketProjectKey}`);

        return Promise.all([
            this.owners.map(owner => this.addAdminProjectPermission(bitbucketProjectKey, owner)),
            this.teamMembers.map(teamMember => this.addWriteProjectPermission(bitbucketProjectKey, teamMember)),
            this.addBranchPermissions(bitbucketProjectKey, this.owners, [QMConfig.subatomic.bitbucket.auth.username]),
            this.addHooks(bitbucketProjectKey),

            _.zipWith(this.owners, this.teamMembers, (owner, member) => {
                this.axios.get(`${QMConfig.subatomic.bitbucket.restUrl}/default-reviewers/1.0/projects/${bitbucketProjectKey}/conditions`)
                    .then(reviewers => {
                        const jsonLength = reviewers.data.length;
                        let reviewerExists = false;

                        for ( let i = 0; i < jsonLength; i++) {
                            if (reviewers.data[i].reviewers[0].name === owner) {
                                reviewerExists = true; break;
                            }
                        }
                        if (reviewerExists !== true ) {
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
        return this.addProjectPermission(projectKey, user, "PROJECT_ADMIN");
    }

    private addWriteProjectPermission(projectKey: string, user: string): AxiosPromise {
        return this.addProjectPermission(projectKey, user, "PROJECT_WRITE");
    }

    private addProjectPermission(projectKey: string, user: string, permission: string = "PROJECT_READ"): AxiosPromise {
        return this.axios.put(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${projectKey}/permissions/users?name=${user}&permission=${permission}`,
            {});
    }

    private addBranchPermissions(bitbucketProjectKey: string, owners: string[], additional: string[] = []): Promise<[any]> {
        const allUsers = owners.concat(additional);
        return Promise.all([
            this.axios.post(`${QMConfig.subatomic.bitbucket.restUrl}/branch-permissions/2.0/projects/${bitbucketProjectKey}/restrictions`,
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
                }),
            this.axios.post(`${QMConfig.subatomic.bitbucket.restUrl}/branch-permissions/2.0/projects/${bitbucketProjectKey}/restrictions`,
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
                }),
            this.axios.post(`${QMConfig.subatomic.bitbucket.restUrl}/branch-permissions/2.0/projects/${bitbucketProjectKey}/restrictions`,
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
                }),
        ]);
    }

    private addHooks(bitbucketProjectKey: string): Promise<[any]> {
        // Enable and configure hooks
        return Promise.all([
            this.axios.put(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${bitbucketProjectKey}/settings/hooks/com.atlassian.bitbucket.server.bitbucket-bundled-hooks:verify-committer-hook/enabled`,
                {}),
            // Enable and configure hooks
            this.axios.put(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${bitbucketProjectKey}/settings/hooks/com.atlassian.bitbucket.server.bitbucket-bundled-hooks:incomplete-tasks-merge-check/enabled`,
                {}),
            // Enable and configure merge checks
            this.axios.put(`${QMConfig.subatomic.bitbucket.restUrl}/api/1.0/projects/${bitbucketProjectKey}/settings/hooks/com.atlassian.bitbucket.server.bitbucket-build:requiredBuildsMergeCheck/enabled`,
                {
                    requiredCount: 1,
                }),
        ]);
    }

    private addDefaultReviewers(bitbucketProjectKey: string, bitbucketUsername: string): AxiosPromise {
        logger.debug(`Adding default reviewer [${bitbucketUsername}] to Bitbucket project: ${bitbucketProjectKey}`);

        // TODO Add default reviewers (the team owners - in future everyone with 'reviewer' role?)

        if (!_.isEmpty(bitbucketUsername)) {
            return bitbucketUserFromUsername(bitbucketUsername)
                .then(user => {
                    logger.debug(`Adding to the default reviewers the Bitbucket user: ${JSON.stringify(user)}`);
                    return this.axios.post(`${QMConfig.subatomic.bitbucket.restUrl}/default-reviewers/1.0/projects/${bitbucketProjectKey}/condition`,
                        {
                            reviewers: [
                                {
                                    id: user.values[0].id,
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
