import "mocha";
import * as assert from "power-assert";
const MockAdapter = require("axios-mock-adapter");
import axios from "axios";
import {QMConfig} from "../../../src/config/QMConfig";
import {AddSlackDetails, Whoami} from "../../../src/gluon/member/Slack";
import {TestMessageClient} from "../TestMessageClient";

describe("Add slack details to existing team member", () => {
    it("should add slack details to existing memnber", done => {
        const mock = new MockAdapter(axios);
        const screenName = "test.user";
        const userId = "9USD45612";
        const email = "test@tester.com";
        const memberId = "3d01d401-abb3-4eee-8884-2ed5a472172d";
        const firstName = "test";

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/members?email=${email}`).reply(200, {
            _embedded: {
                teamMemberResources: [
                    {memberId: `${memberId}`},
                ],
            },
        });

        mock.onPut(`${QMConfig.subatomic.gluon.baseUrl}/members/${memberId}`).reply(200, {
            memberId: `${memberId}`,
            firstName: `${firstName}`,
            slack: {
                screenName: `${screenName}`,
                userId: `${userId}`,
            },
        });

        const subject = new AddSlackDetails();
        subject.screenName = `${screenName}`;
        subject.userId = `${userId}`;
        subject.email = `${email}`;

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
        };

        subject.handle(fakeContext)
            .then(() => {
                assert(fakeContext.messageClient.textMsg.text === `Thanks *${firstName}*, your Slack details have been added to your Subatomic profile. 👍`);
                return Promise.resolve();
            })
            .then(done, done);
    });
});

describe("Whoami command handler", () => {

    it("should return user's slack details", done => {

        const subject = new Whoami();
        subject.screenName = "TestUser";
        subject.userId = "U675675";

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
        };

        subject.handle(fakeContext)
            .then(() => {
                assert(fakeContext.messageClient.textMsg.text.trim() === "*Slack screen name:* TestUser\n*Slack user Id:* U675675");
                return Promise.resolve();
            })
            .then(done, done);
    });

});
