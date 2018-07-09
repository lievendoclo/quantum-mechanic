import "mocha";
import * as assert from "power-assert";
const MockAdapter = require("axios-mock-adapter");
import axios from "axios";
import {QMConfig} from "../../../src/config/QMConfig";
import {CreateTeam} from "../../../src/gluon/commands/team/CreateTeam";
import {TestMessageClient} from "../TestMessageClient";

describe("Create Team test", () => {
    it("should create team", async () => {
        const mock = new MockAdapter(axios);
        const screenName = "Test.User";

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/members?slackScreenName=${screenName}`).reply(200, {
            _embedded: {
                teamMemberResources: [
                    {
                        memberId: "3d01d401-abb3-4eee-8884-2ed5a472172d",
                        slack: {
                            screenName: `${screenName}`,
                            userId: "9USDA7D6dH",
                        },
                    },
                ],
            },
        });

        mock.onPost(`${QMConfig.subatomic.gluon.baseUrl}/teams`).reply(201, {
            name: "A Team",
            description: "Best team alive!",
            createdBy: "3d01d401-abb3-4eee-8884-2ed5a472172d",
        });

        const subject = new CreateTeam();
        subject.screenName = `${screenName}`;

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
        };

        await subject.handle(fakeContext);
        assert(JSON.stringify(fakeContext.messageClient) === "{}");
    });

    it("should fail creating team", async () => {
        const mock = new MockAdapter(axios);
        const screenName = "Test.User";

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/members?slackScreenName=${screenName}`).reply(200, {
            _embedded: {
                teamMemberResources: [
                    {
                        memberId: "3d01d401-abb3-4eee-8884-2ed5a472172d",
                        slack: {
                            screenName: `${screenName}`,
                            userId: "9USDA7D6dH",
                        },
                    },
                ],
            },
        });

        mock.onPost(`${QMConfig.subatomic.gluon.baseUrl}/teams`).reply(400, {
            name: "A Team",
            description: "Best team alive!",
            createdBy: "3d01d401-abb3-4eee-8884-2ed5a472172d",
        });

        const subject = new CreateTeam();
        subject.screenName = `${screenName}`;

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
        };

        await subject.handle(fakeContext);
        assert(fakeContext.messageClient.textMsg === "❗Unhandled exception occurred. Please alert your system admin to check the logs and correct the issue accordingly.");
    });
});
