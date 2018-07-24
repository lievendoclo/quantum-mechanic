import axios from "axios";
import "mocha";
import * as assert from "power-assert";
import {QMConfig} from "../../../../src/config/QMConfig";
import {JoinTeam} from "../../../../src/gluon/commands/team/JoinTeam";
import {TestMessageClient} from "../../TestMessageClient";

const MockAdapter = require("axios-mock-adapter");

describe("Join team tests", () => {
    it("should ask for team selection", async () => {
        const mock = new MockAdapter(axios);
        const slackName = "Test.User";
        const teamId = "197c1bb3-9c1d-431f-8db3-2188b9c75dce";
        const name = "test";

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/teams`).reply(200, {
            _embedded: {
                teamResources: [
                    {
                        teamId: `${teamId}`,
                        name: `${name}`,
                    },
                ],
            },
        });

        const subject = new JoinTeam();
        subject.slackName = `${slackName}`;

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
        };

        await subject.handle(fakeContext);
        assert(fakeContext.messageClient.textMsg[0].text === `Please select the team you would like to join`);
    });
});
