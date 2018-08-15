import "mocha";
import * as assert from "power-assert";
import {QMConfig} from "../../../../src/config/QMConfig";
import {AddSlackDetails} from "../../../../src/gluon/commands/member/AddSlackDetails";
import {GluonService} from "../../../../src/gluon/services/gluon/GluonService";
import {AwaitAxios} from "../../../../src/gluon/util/shared/AwaitAxios";
import {TestMessageClient} from "../../TestMessageClient";

const MockAdapter = require("axios-mock-adapter");

describe("Add slack details to existing team member", () => {
    it("should add slack details to existing memnber", done => {
        const axiosWrapper = new AwaitAxios();
        const mock = new MockAdapter(axiosWrapper.axiosInstance);
        const screenName = "test.user";
        const userId = "9USD45612";
        const email = "test@tester.com";
        const memberId = "3d01d401-abb3-4eee-8884-2ed5a472172d";
        const firstName = "test";

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/members?email=${email}`).reply(200, {
            _embedded: {
                teamMemberResources: [
                    {
                        memberId: `${memberId}`,
                        firstName: `${firstName}`,
                    },
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

        const gluonService = new GluonService(axiosWrapper);

        const subject = new AddSlackDetails(gluonService);
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
                assert(fakeContext.messageClient.textMsg[0].text === `Thanks *${firstName}*, your Slack details have been added to your Subatomic profile. 👍`);
                return Promise.resolve();
            })
            .then(done, done);
    });
});
