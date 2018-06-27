import "mocha";
import * as assert from "power-assert";
const MockAdapter = require("axios-mock-adapter");
import axios from "axios";
import {QMConfig} from "../../../src/config/QMConfig";
import {MembershipRequestClosed} from "../../../src/gluon/team/MembershipRequestClosed";
import {TestGraphClient} from "../TestGraphClient";
import {TestMessageClient} from "../TestMessageClient";

describe("Close a membership request", () => {
    it("should approve team member", async () => {
        const mock = new MockAdapter(axios);
        const approverUserName = "Approval.User";
        const slackTeam = "A-Team";
        const slackChannelId = "84383asda2123-334daeerasde";
        const teamChannel = "Four Dudes";
        const teamId = "79c41ee3-f092-4664-916f-da780195a51e";
        const teamName = "test_Team";
        const membershipRequestId = "981289dhd891u-89qdufsnbu29";
        const userScreenName = "Test.User";
        const userSlackId = "U9DE5SY8";
        const approvalStatus = "APPROVED";
        const memberId = "3d01d401-abb3-4eee-8884-2ed5a472172d";

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/members?slackScreenName=${approverUserName}`).reply(200, {
            _embedded: {
                teamMemberResources: [
                    {
                        memberId: `${memberId}`,
                        teamId: `${teamId}`,
                        slack: {
                            screenName: `${userScreenName}`,
                            userId: `${userSlackId}`,
                        },
                    },
                ],
            },
        });

        mock.onPut(`${QMConfig.subatomic.gluon.baseUrl}/teams/${teamId}`).reply(200, {
            membershipRequests: [
                {
                    membershipRequestId: `${membershipRequestId}`,
                    approvedBy: {
                        memberId: `${memberId}`,
                    },
                    requestStatus: `${approvalStatus}`,
                },
            ],
        });

        const subject = new MembershipRequestClosed();
        subject.approverUserName = `${approverUserName}`;
        subject.slackTeam = `${slackTeam}`;
        subject.slackChannelId = `${slackChannelId}`;
        subject.teamChannel = `${teamChannel}`;
        subject.teamId = `${teamId}`;
        subject.teamName = `${teamName}`;
        subject.membershipRequestId = `${membershipRequestId}`;
        subject.userScreenName = `${userScreenName}`;
        subject.userSlackId = `${userSlackId}`;
        subject.approvalStatus = `${approvalStatus}`;

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
            graphClient: new TestGraphClient(),

        };

        await subject.handle(fakeContext);
        assert(fakeContext.messageClient.textMsg.text === `Welcome to the team *@${userScreenName}*!`);
    });

    it("should reject team member", async () => {
        const mock = new MockAdapter(axios);
        const approverUserName = "Approval.User";
        const slackTeam = "A-Team";
        const slackChannelId = "84383asda2123-334daeerasde";
        const teamChannel = "test-channel";
        const teamId = "79c41ee3-f092-4664-916f-da780195a51e";
        const teamName = "test_Team";
        const membershipRequestId = "981289dhd891u-89qdufsnbu29";
        const userScreenName = "Test.User";
        const userSlackId = "U9DE5SY8";
        const approvalStatus = "REJECT";
        const memberId = "3d01d401-abb3-4eee-8884-2ed5a472172d";

        mock.onGet(`${QMConfig.subatomic.gluon.baseUrl}/members?slackScreenName=${approverUserName}`).reply(200, {
            _embedded: {
                teamMemberResources: [
                    {
                        memberId: `${memberId}`,
                        teamId: `${teamId}`,
                        slack: {
                            screenName: `${userScreenName}`,
                            userId: `${userSlackId}`,
                        },
                    },
                ],
            },
        });

        mock.onPut(`${QMConfig.subatomic.gluon.baseUrl}/teams/${teamId}`).reply(200, {
            membershipRequests: [
                {
                    membershipRequestId: `${membershipRequestId}`,
                    approvedBy: {
                        memberId: `${memberId}`,
                    },
                    requestStatus: `${approvalStatus}`,
                },
            ],
        });

        const subject = new MembershipRequestClosed();
        subject.approverUserName = `${approverUserName}`;
        subject.slackTeam = `${slackTeam}`;
        subject.slackChannelId = `${slackChannelId}`;
        subject.teamChannel = `${teamChannel}`;
        subject.teamId = `${teamId}`;
        subject.teamName = `${teamName}`;
        subject.membershipRequestId = `${membershipRequestId}`;
        subject.userScreenName = `${userScreenName}`;
        subject.userSlackId = `${userSlackId}`;
        subject.approvalStatus = `${approvalStatus}`;

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
            graphClient: new TestGraphClient(),

        };

        await subject.handle(fakeContext);
        assert(fakeContext.messageClient.textMsg === `Membership request rejected`);
    });
});
