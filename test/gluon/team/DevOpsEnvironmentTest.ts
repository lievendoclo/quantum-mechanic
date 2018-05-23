import "mocha";
import * as assert from "power-assert";
const MockAdapter = require("axios-mock-adapter");
import axios from "axios";
import {QMConfig} from "../../../src/config/QMConfig";
import {NewDevOpsEnvironment} from "../../../src/gluon/team/DevOpsEnvironment";
import {TestMessageClient} from "../TestMessageClient";

describe("Create a new or use an existing Openshift DevOps environment", () => {
    it("Should use existing DevOps environment", done => {
        const mock = new MockAdapter(axios);
        const teamName = "test_name";
        const screenName = "Test.User";
        const teamChannel = "test_channel";
        const teamId = "79c41ee3-f092-4664-916f-da780195a51e";
        const memberId = "3d01d401-abb3-4eee-8884-2ed5a472172d";

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/teams?name=${teamName}`).reply(200, {
            _embedded: {
                teamResources: [
                    {
                        memberId: `${memberId}`,
                        teamId: `${teamId}`,
                        slack: {
                            screenName: `${screenName}`,
                            userId: "9USDA7D6dH",
                        },
                    },
                ],
            },
        });

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/teams?slackTeamChannel=${teamChannel}`).reply(200, {
            _embedded: {
                teamResources: [
                    {
                        name: `${teamName}`,
                        memberId: `${memberId}`,
                        teamId: `${teamId}`,
                        slack: {
                            screenName: `${screenName}`,
                            userId: "9USDA7D6dH",
                            teamChannel: `${teamChannel}`,
                        },
                    },
                ],
            },
        });

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/members?slackScreenName=${screenName}`).reply(200, {
            _embedded: {
                teamMemberResources: [
                    {
                        memberId: `${memberId}`,
                        teamId: `${teamId}`,
                        slack: {
                            screenName: `${screenName}`,
                            userId: "9USDA7D6dH",
                        },
                    },
                ],
            },
        });

        mock.onPut(`${QMConfig.subatomic.gluon.baseUrl}/teams/${teamId}`).reply(200, {
            devOpsEnvironment: {
                requestedBy: `${memberId}`,
            },
        });

        const subject = new NewDevOpsEnvironment();
        subject.teamName = `${teamName}`;
        subject.teamChannel = `${teamChannel}`;
        subject.screenName = `${screenName}`;

        const fakeContext = {
            teamId: `${teamId}`,
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
        };

        subject.handle(fakeContext)
            .then(() => {
                return Promise.resolve();
            })
            .then(() => {
                return Promise.resolve();
            })
            .then(() => {
                return Promise.resolve();
            })
            .then(() => {
                assert(fakeContext.messageClient.textMsg.text === `🚀 Your DevOps environment for *${teamName}* team, is being provisioned...`);
            })
            .then(done, done);
    });

    it("Should fail because of no team associated with user", done => {
        const mock = new MockAdapter(axios);
        const teamName = "test_name";
        const screenName = "Test.User";
        const teamChannel = "test_channel";
        const teamId = "79c41ee3-f092-4664-916f-da780195a51e";
        const memberId = "3d01d401-abb3-4eee-8884-2ed5a472172d";

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/teams?name=${teamName}`).reply(200, {
            _embedded: {
                teamResources: [
                    {
                        memberId: `${memberId}`,
                        teamId: `${teamId}`,
                        slack: {
                            screenName: `${screenName}`,
                            userId: "9USDA7D6dH",
                        },
                    },
                ],
            },
        });

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/teams?slackTeamChannel=${teamChannel}`).reply(200, {
            _embedded: {
                teamResources: [
                    {
                        name: `${teamName}`,
                        memberId: `${memberId}`,
                        teamId: `${teamId}`,
                        slack: {
                            screenName: `${screenName}`,
                            userId: "9USDA7D6dH",
                            teamChannel: `${teamChannel}`,
                        },
                    },
                ],
            },
        });

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/teams?slackScreenName=${screenName}`).reply(200, {
            _embedded: {
            },
        });

        mock.onPut(`${QMConfig.subatomic.gluon.baseUrl}/teams/${teamId}`).reply(200, {
            devOpsEnvironment: {
                requestedBy: `${memberId}`,
            },
        });

        const subject = new NewDevOpsEnvironment();
        subject.screenName = `${screenName}`;

        const fakeContext = {
            teamId: `${teamId}`,
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
        };

        subject.handle(fakeContext)
            .then(() => {
                assert(fakeContext.messageClient.textMsg.text === "Unfortunately, you are not a member of any team. To associate this project you need to be a member of at least one team.");
            })
            .then(done, done);
    });
});
