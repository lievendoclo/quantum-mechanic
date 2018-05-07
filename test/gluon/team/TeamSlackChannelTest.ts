import "mocha";
import * as assert from "power-assert";
const MockAdapter = require("axios-mock-adapter");
import axios from "axios";
import {QMConfig} from "../../../src/config/QMConfig";
import {NewTeamSlackChannel} from "../../../src/gluon/team/TeamSlackChannel";
import {TestMessageClient} from "../TestMessageClient";

describe("Create a new team channel", () => {
    it("should create team channel", done => {
        const mock = new MockAdapter(axios);
        const screenName = "Test.User";
        const teamName = "test_Team";
        const teamId = "79c41ee3-f092-4664-916f-da780195a51e";

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/teams?name=${teamName}`).reply(200, {
            _embedded: {
                teamResources: [
                    {
                        memberId: "3d01d401-abb3-4eee-8884-2ed5a472172d",
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
            slack: {
                teamChannel: "test-channel",
            },
        });

        const subject = new NewTeamSlackChannel();
        subject.teamName = `${teamName}`;
        subject.teamId = `${teamId}`,
        subject.teamChannel = "test-channel";

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
        };

        subject.handle(fakeContext)
            .then(() => {
                assert(JSON.stringify(fakeContext.messageClient) === "{}");
            })
            .then(done, done);
    });

    it("should fail creating team channel", done => {
        const mock = new MockAdapter(axios);
        const screenName = "Test.User";
        const teamName = "test_Team";
        const teamId = "79c41ee3-f092-4664-916f-da780195a51e";

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/teams?name=${teamName}`).reply(200, {
            _embedded: {
            },
        });

        mock.onPut(`${QMConfig.subatomic.gluon.baseUrl}/teams/${teamId}`).reply(200, {
            slack: {
                teamChannel: "test-channel",
            },
        });

        const subject = new NewTeamSlackChannel();
        subject.teamName = `${teamName}`;
        subject.teamId = `${teamId}`,
            subject.teamChannel = "test-channel";

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
        };

        subject.handle(fakeContext)
            .then(() => {
                assert(fakeContext.messageClient.textMsg.text === `There was an error creating your *${teamName}* team channel`);
            })
            .then(done, done);
    });
});
