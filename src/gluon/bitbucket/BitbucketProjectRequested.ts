import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    success,
    SuccessPromise,
} from "@atomist/automation-client";
import axios from "axios";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";

@EventHandler("Receive BitbucketProjectRequestedEvent events", `
subscription BitbucketProjectRequestedEvent {
  BitbucketProjectRequestedEvent {
    id
    project {
      projectId
      name
      description
    }
    teams {
      teamId
      name
      slackIdentity {
        teamChannel
      }
    }
    bitbucketProjectRequest {
      key
      name
      description
    }
    requestedBy {
      firstName
      slackIdentity {
        screenName
      }
    }
  }
}
`)
export class BitbucketProjectRequested implements HandleEvent<any> {

    // TODO move these to let's if they can (moved up because of another unrelated bug)
    private bitbucketProjectId: string;
    private bitbucketProjectUrl: string;

    public handle(event: EventFired<any>, ctx: HandlerContext): Promise<HandlerResult> {
        logger.info(`Ingested BitbucketProjectRequested event: ${JSON.stringify(event.data)}`);

        const caFile = path.resolve(__dirname, "/Users/donovan/dev/absa/core/bitbucket-server/ca-chain.cert.pem");
        const bitbucketAxios = axios.create({
            httpsAgent: new https.Agent({
                rejectUnauthorized: true,
                ca: fs.readFileSync(caFile),
            }),
        });

        const bitbucketProjectRequestedEvent = event.data.BitbucketProjectRequestedEvent[0];
        const key: string = bitbucketProjectRequestedEvent.bitbucketProjectRequest.key;
        const name: string = bitbucketProjectRequestedEvent.bitbucketProjectRequest.name;
        const description: string = bitbucketProjectRequestedEvent.bitbucketProjectRequest.description;

        return bitbucketAxios.post("https://bitbucket.core.local/rest/api/1.0/projects",
            {
                key,
                name,
                description,
            }, {
                auth: {
                    username: "donovan",
                    password: "donovan",
                },
            })
            .then(project => {
                logger.info(`Created project: ${JSON.stringify(project.data)} -> ${project.data.id} + ${project.data.links.self[0].href}`);
                this.bitbucketProjectId = project.data.id;
                this.bitbucketProjectUrl = project.data.links.self[0].href;
                return this.configureProject(key);
            }, error => {
                logger.warn(`Error creating project: ${error.response.status}`);
                if (error.response.status === 201 || error.response.status === 409) {

                    // TODO if the status is 409, then get the existing project id and Url

                    return this.configureProject(key);
                } else {
                    return ctx.messageClient.addressUsers({
                        // TODO make this more descriptive
                        text: `There was an error creating the ${bitbucketProjectRequestedEvent.project.name} Bitbucket project`,
                    }, bitbucketProjectRequestedEvent.requestedBy.slackIdentity.screenName);
                }
            })
            .then(() => {
                // Add access CI/CD access key
                return bitbucketAxios.post(`https://bitbucket.core.local/rest/keys/1.0/projects/${key}/ssh`,
                    {
                        key: {
                            // TODO where do we store/reference this key?
                            text: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCzuPsKSdUwMVw7qQsNY0DQ0jCD3nAJSYoU7yHTgE2MLsRznNpec2dhjkzrgkWULXZlzFqf7MIJheYoIxHeoJzxrV+3nKT99FyFHSWJiEfk1G7PDRyptXspWRSvkhk8ovijVa7IeoYGLGxfGjF+gwO0dpyr/p8bX7t2+N0X0FZbkU7zjKJ5TrSgJuheVi7r1MO16Zr3k0uyRNDSDKPRt2IDmjRT9y6/ofhvFMn7JrMXkHpRYIJJQ/H2py63qYQatCpi38znBfke5fFoBK4L4/vALbH/Gjqj1J5Uadn8inGyrL0WxohWuhwk/K/bwOSw0LNO8bQ5lAmPgPgJYyA4Plm0onPLp1MZcO/Zj5UjEbmf3w+p2/Th0z6LxA0ytIedTYk8lz35h1yuINd1sp2VmiYS10pqJ1HW/3Mx7McwA8tLsuxKjYmOw4sIsunS+GQPPJbVQrB8ekx2CkD/nwf6fyH+RqtIQ6UBo+9013KwJKOd4qEGkKEN3kBzNoamOvfHvJROX7DQJKRux2/qJXggxJ8F7u0Hj5bSrhYbRNV9T9IfJPGWrJm56V+CbqA0mm7FmSuz2+EeUd3h5R8fxju75gbqFsCLnpuDhhUKxE2PMyRqAAaJ7AZYdXXl8NeNbWEPg/GgyEx4not76ibBDggkEjfYxYSU3689uVMhCv+VN2h6ew== CI/CD for Test Team Alpha",
                        },
                        permission: "PROJECT_READ",
                    },
                    {
                        auth: {
                            username: "donovan",
                            password: "donovan",
                        },
                    });
            })
            .catch(error => {
                logger.warn(`Could not add SSH keys to Bitbucket project: [${error.response.status}-${error.response.data}]`);
                if (error.response.status === 409) {
                    // it's ok, it's already done 👍
                    return SuccessPromise;
                }

                return ctx.messageClient.addressUsers({
                    text: `There was an error adding SSH keys for ${bitbucketProjectRequestedEvent.project.name} Bitbucket project`,
                }, bitbucketProjectRequestedEvent.requestedBy.slackIdentity.screenName);
            })
            .then(() => {
                // TODO this if should be deleted when the 409 above is handled correctly
                if (this.bitbucketProjectId) {
                    logger.info(`Confirming Bitbucket project: [${this.bitbucketProjectId}-${this.bitbucketProjectUrl}]`);
                    return axios.put(`http://localhost:8080/projects/${bitbucketProjectRequestedEvent.project.projectId}`,
                        {
                            bitbucketProject: {
                                bitbucketProjectId: this.bitbucketProjectId,
                                url: this.bitbucketProjectUrl,
                            },
                        })
                        .then(success, error => {
                            logger.error(`Could not confirm Bitbucket project: [${error.response.status}-${error.response.data}]`);
                            return ctx.messageClient.addressUsers({
                                text: `There was an error confirming the ${bitbucketProjectRequestedEvent.project.name} Bitbucket project details`,
                            }, bitbucketProjectRequestedEvent.requestedBy.slackIdentity.screenName);
                        });
                } else {
                    logger.warn(`Bitbucket project [${name}] probably already exists, so not confirming.`);
                    return SuccessPromise;
                }
            });

        // TODO find out if we can create teams on BB
        // if we can then we can create a group with the teams name
        // and assign the group read/write (owners still get admin individually
        // unless we have a "<team-name>-owners" group?

        // finally, update the Project with the created BB project details
        // like Id and URL etc.
    }

    private configureProject(key: string): Promise<[any]> {
        const caFile = path.resolve(__dirname, "/Users/donovan/dev/absa/core/bitbucket-server/ca-chain.cert.pem");
        const bitbucketAxios = axios.create({
            httpsAgent: new https.Agent({
                rejectUnauthorized: true,
                ca: fs.readFileSync(caFile),
            }),
        });

        const owner = "bob";
        const bitbucketUsername = "donovan";
        const bitbucketId = "1";

        logger.info(`Configuring project for key: ${key}`);

        return Promise.all([
            // Add project permissions:
            // -> owners get admin access (PROJECT_ADMIN)
            // -> members get read/write access
            bitbucketAxios.put(`https://bitbucket.core.local/rest/api/1.0/projects/${key}/permissions/users?name=${owner}&permission=PROJECT_WRITE`,
                {},
                {
                    auth: {
                        username: "donovan",
                        password: "donovan",
                    },
                }),
            // Add branch permissions
            bitbucketAxios.post(`https://bitbucket.core.local/rest/branch-permissions/2.0/projects/${key}/restrictions`,
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
                    users: [
                        // need to get this via the /users API
                        // use the members email address?
                        // https://docs.atlassian.com/bitbucket-server/rest/5.7.0/bitbucket-rest.html#idm45568366416656
                        bitbucketUsername,
                    ],
                },
                {
                    auth: {
                        username: "donovan",
                        password: "donovan",
                    },
                }),
            bitbucketAxios.post(`https://bitbucket.core.local/rest/branch-permissions/2.0/projects/${key}/restrictions`,
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
                    users: [
                        // need to get this via the /users API
                        // use the members email address?
                        // https://docs.atlassian.com/bitbucket-server/rest/5.7.0/bitbucket-rest.html#idm45568366416656
                        bitbucketUsername,
                    ],
                },
                {
                    auth: {
                        username: "donovan",
                        password: "donovan",
                    },
                }),
            bitbucketAxios.post(`https://bitbucket.core.local/rest/branch-permissions/2.0/projects/${key}/restrictions`,
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
                    users: [
                        // need to get this via the /users API
                        // use the members email address?
                        // https://docs.atlassian.com/bitbucket-server/rest/5.7.0/bitbucket-rest.html#idm45568366416656
                        bitbucketUsername,
                    ],
                },
                {
                    auth: {
                        username: "donovan",
                        password: "donovan",
                    },
                }),
            // Enable and configure hooks
            bitbucketAxios.put(`https://bitbucket.core.local/rest/api/1.0/projects/${key}/settings/hooks/com.atlassian.bitbucket.server.bitbucket-bundled-hooks:verify-committer-hook/enabled`,
                {},
                {
                    auth: {
                        username: "donovan",
                        password: "donovan",
                    },
                }),
            // Enable and configure hooks
            bitbucketAxios.put(`https://bitbucket.core.local/rest/api/1.0/projects/${key}/settings/hooks/com.atlassian.bitbucket.server.bitbucket-bundled-hooks:incomplete-tasks-merge-check/enabled`,
                {},
                {
                    auth: {
                        username: "donovan",
                        password: "donovan",
                    },
                }),
            // Enable and configure merge checks
            bitbucketAxios.put(`https://bitbucket.core.local/rest/api/1.0/projects/${key}/settings/hooks/com.atlassian.bitbucket.server.bitbucket-build:requiredBuildsMergeCheck/enabled`,
                {
                    requiredCount: 1,
                },
                {
                    auth: {
                        username: "donovan",
                        password: "donovan",
                    },
                }),
            // Add default reviewers (the team owners - in future everyone with 'reviewer' role?)
            bitbucketAxios.post(`https://bitbucket.core.local/rest/default-reviewers/1.0/projects/${key}/condition`,
                {
                    reviewers: [
                        {
                            // TODO get user id from email?
                            id: bitbucketId,
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
                },
                {
                    auth: {
                        username: "donovan",
                        password: "donovan",
                    },
                }),
        ]);
    }
}
