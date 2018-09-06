import * as assert from "power-assert";
import {QMConfig} from "../../../../src/config/QMConfig";
import {OnboardMember} from "../../../../src/gluon/commands/member/OnboardMember";
import {GluonService} from "../../../../src/gluon/services/gluon/GluonService";
import {AwaitAxios} from "../../../../src/http/AwaitAxios";
import {TestMessageClient} from "../../TestMessageClient";

const MockAdapter = require("axios-mock-adapter");

describe("Onboard new member test", () => {
    it("should welcome new user", async () => {
        const axiosWrapper = new AwaitAxios();
        const mock = new MockAdapter(axiosWrapper.axiosInstance);

        mock.onPost(`${QMConfig.subatomic.gluon.baseUrl}/members`).reply(201, {
            firstName: "Test",
            lastName: "User",
            email: "test.user@foo.co.za",
            domainUsername: "tete528",
            slack: {
                screenName: "test.user",
                userId: "9USDA7D6dH",
            },
        });

        const gluonService = new GluonService(axiosWrapper);

        const subject = new OnboardMember(gluonService);
        subject.domainUsername = "tete528";
        subject.email = "test.user@foo.co.za";
        subject.firstName = "Test";
        subject.userId = "9USDA7D6dH";
        subject.lastName = "User";

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            workspaceId: "2341234123",
            messageClient: new TestMessageClient(),
        };

        await subject.handle(fakeContext);
        assert(fakeContext.messageClient.textMsg[0].text.trim() === "Welcome to the Subatomic environment *Test*!\nNext steps are to either join an existing team or create a new one.");
    });
});
