import "mocha";
import * as assert from "power-assert";
import {QMConfig} from "../../../../src/config/QMConfig";
import {CreateTeam} from "../../../../src/gluon/commands/team/CreateTeam";
import {GluonService} from "../../../../src/gluon/services/gluon/GluonService";
import {AwaitAxios} from "../../../../src/gluon/util/shared/AwaitAxios";
import {TestMessageClient} from "../../TestMessageClient";

const MockAdapter = require("axios-mock-adapter");

describe("Create Team test", () => {
    it("should create team", async () => {
        const axiosWrapper = new AwaitAxios();
        const mock = new MockAdapter(axiosWrapper.axiosInstance);
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

        const gluonService = new GluonService(axiosWrapper);

        const subject = new CreateTeam(gluonService);
        subject.screenName = `${screenName}`;

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            workspaceId: "2341234123",
            messageClient: new TestMessageClient(),
        };

        await subject.handle(fakeContext);

        assert.equal(fakeContext.messageClient.textMsg.length, 0);
    });

    it("should fail creating team", async () => {
        const axiosWrapper = new AwaitAxios();
        const mock = new MockAdapter(axiosWrapper.axiosInstance);
        const screenName = "Test.User";

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/members?slackScreenName=${screenName}`).reply(201, {
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

        mock.onPost(`${QMConfig.subatomic.gluon.baseUrl}/teams`).reply(409, {
            name: "A Team",
            description: "Best team alive!",
            createdBy: "3d01d401-abb3-4eee-8884-2ed5a472172d",
        });

        const gluonService = new GluonService(axiosWrapper);

        const subject = new CreateTeam(gluonService);
        subject.screenName = `${screenName}`;

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            workspaceId: "2341234123",
            messageClient: new TestMessageClient(),
        };

        await subject.handle(fakeContext);
        assert(fakeContext.messageClient.textMsg[0].text === "❗Failed to create team since the team name is already in use. Please retry using a different team name.");
    });
});
