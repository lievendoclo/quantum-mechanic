import assert = require("power-assert");
import {anything, instance, mock, when} from "ts-mockito";
import {GluonService} from "../../../../src/gluon/services/gluon/GluonService";
import {MemberService} from "../../../../src/gluon/services/gluon/MemberService";
import {TeamService} from "../../../../src/gluon/services/gluon/TeamService";
import {TeamSlackChannelService} from "../../../../src/gluon/services/team/TeamSlackChannelService";
import {TestGraphClient} from "../../TestGraphClient";
import {TestMessageClient} from "../../TestMessageClient";

describe("TeamSlackChannelService getGluonTeam", () => {
    it("should fail to get team details", async () => {
        const mockedTeamService = mock(TeamService);
        when(mockedTeamService.gluonTeamByName("Team1")).thenResolve({status: 400});
        const gluonService = new GluonService(instance(mockedTeamService));
        const service = new TeamSlackChannelService(gluonService);

        let thrownError = null;
        try {
            await service.getGluonTeam("Team1", "something");
        } catch (error) {
            thrownError = error;
        }

        assert.equal(thrownError.message, `Failed to find to gluon team Team1`);

    });

    it("should succeed and return team details", async () => {
        const mockedTeamService = mock(TeamService);
        when(mockedTeamService.gluonTeamByName("Team1"))
            .thenResolve(
                {
                    status: 200,
                    data: {
                        _embedded: {
                            teamResources: [
                                {
                                    id: "Team1Id",
                                },
                            ],
                        },
                    },
                });
        const gluonService = new GluonService(instance(mockedTeamService));
        const service = new TeamSlackChannelService(gluonService);

        const result = await service.getGluonTeam("Team1", "something");

        assert.equal(result.id, `Team1Id`);
    });
});

describe("TeamSlackChannelService addSlackDetailsToGluonTeam", () => {
    it("should fail to add slack details", async () => {
        const mockedTeamService = mock(TeamService);
        when(mockedTeamService.addSlackDetailsToTeam("Team1Id", anything())).thenResolve({status: 400});
        const gluonService = new GluonService(instance(mockedTeamService));
        const service = new TeamSlackChannelService(gluonService);

        let thrownError = null;
        try {
            await service.addSlackDetailsToGluonTeam("Team1Id", "channelName", true);
        } catch (error) {
            thrownError = error;
        }

        assert.equal(thrownError.message, "Failed to add slack details to team with id Team1Id");

    });

    it("should succeed and add slack details", async () => {
        const mockedTeamService = mock(TeamService);
        when(mockedTeamService.addSlackDetailsToTeam("Team1Id", anything())).thenResolve({status: 200});
        const gluonService = new GluonService(instance(mockedTeamService));
        const service = new TeamSlackChannelService(gluonService);

        let thrownError = false;
        try {
            await service.addSlackDetailsToGluonTeam("Team1Id", "channelName", true);
        } catch (error) {
            thrownError = true;
        }

        assert.equal(thrownError, false);

    });
});

describe("TeamSlackChannelService createTeamSlackChannel", () => {
    it("should fail to create the channel", async () => {

        const service = new TeamSlackChannelService();

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
            graphClient: new TestGraphClient(),
        };

        fakeContext.graphClient.executeMutationFromFileResults.push({
            result: true,
            returnValue: {},
        });

        let thrownError;
        try {
            await service.createTeamSlackChannel(fakeContext, "Team1Id", "channelName");
        } catch (error) {
            thrownError = error;
        }

        assert.equal(thrownError.message, `Channel with channel name channelName could not be created.`);
    });
    it("should fail to add the bot to private channel", async () => {

        const service = new TeamSlackChannelService();

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
            graphClient: new TestGraphClient(),
        };

        fakeContext.graphClient.executeMutationFromFileResults.push({
            result: true,
            returnValue: {createSlackChannel: {id: "Team1ChannelID"}},
        });
        fakeContext.graphClient.executeMutationFromFileResults.push({
            result: false,
            returnValue: {networkError: {response: {status: 400}}},
        });

        await service.createTeamSlackChannel(fakeContext, "Team1Id", "channelName");

        assert(fakeContext.messageClient.textMsg[0].indexOf("❗ The channel has been successfully linked to your team but since the channel \*channelName\* is private") > -1);
    });
    it("should create channel and add bot", async () => {

        const service = new TeamSlackChannelService();

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
            graphClient: new TestGraphClient(),
        };

        fakeContext.graphClient.executeMutationFromFileResults.push({
            result: true,
            returnValue: {createSlackChannel: {id: "Team1ChannelID"}},
        });

        let thrownError = false;
        try {
            await service.createTeamSlackChannel(fakeContext, "Team1Id", "channelName");
        } catch (error) {
            thrownError = true;
        }
        assert.equal(thrownError, false);
    });
});

describe("TeamSlackChannelService tryInviteGluonMemberToChannel", () => {
    it("should fail to find member", async () => {
        const mockedMemberService = mock(MemberService);
        when(mockedMemberService.gluonMemberFromMemberId("Member1Id")).thenResolve({status: 400});
        const gluonService = new GluonService(undefined, instance(mockedMemberService));
        const service = new TeamSlackChannelService(gluonService);

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
            graphClient: new TestGraphClient(),
        };

        let thrownError;
        try {
            await service.tryInviteGluonMemberToChannel(fakeContext, "Member1Id", "SlackTeam1Id", "SlackChannel1Id");
        } catch (error) {
            thrownError = error;
        }

        assert.equal(thrownError.message, "Unable to find member");
    });

    it("should fail to invite member", async () => {
        const mockedMemberService = mock(MemberService);
        when(mockedMemberService.gluonMemberFromMemberId("Member1Id")).thenResolve({
            status: 200,
            data: {firstName: "Kyle"},
        });
        const gluonService = new GluonService(undefined, instance(mockedMemberService));
        const service = new TeamSlackChannelService(gluonService);

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
            graphClient: new TestGraphClient(),
        };

        let thrownError;
        try {
            await service.tryInviteGluonMemberToChannel(fakeContext, "Member1Id", "SlackTeam1Id", "SlackChannel1Id");
        } catch (error) {
            thrownError = error;
        }

        assert.equal(thrownError.message, "User has no associated slack id to invite");
    });

    it("should invite member", async () => {
        const mockedMemberService = mock(MemberService);
        when(mockedMemberService.gluonMemberFromMemberId("Member1Id")).thenResolve({
            status: 200,
            data: {firstName: "Kyle", slack: {userId: "userId1"}},
        });
        const gluonService = new GluonService(undefined, instance(mockedMemberService));
        const service = new TeamSlackChannelService(gluonService);

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
            graphClient: new TestGraphClient(),
        };

        let thrownError = false;
        try {
            await service.tryInviteGluonMemberToChannel(fakeContext, "Member1Id", "SlackTeam1Id", "SlackChannel1Id");

        } catch (error) {
            thrownError = true;
        }
        assert.equal(thrownError, false);
    });

});

describe("TeamSlackChannelService inviteListOfGluonMembersToChannel", () => {
    it("should fail to add 1 member and succeed to add to the other", async () => {
        const mockedMemberService = mock(MemberService);
        when(mockedMemberService.gluonMemberFromMemberId("1")).thenResolve({
            status: 200,
            data: {firstName: "A", slack: {userId: "userId1"}},
        });
        when(mockedMemberService.gluonMemberFromMemberId("2")).thenResolve({
            status: 400,
        });
        const gluonService = new GluonService(undefined, instance(mockedMemberService));
        const service = new TeamSlackChannelService(gluonService);

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            messageClient: new TestMessageClient(),
            graphClient: new TestGraphClient(),
        };

        await service.inviteListOfGluonMembersToChannel(fakeContext,
            "SlackTeam1Id",
            "SlackChannel1Id",
            "ChannelName",
            [
                {memberId: "1", firstName: "A", lastName: "B"},
                {memberId: "2", firstName: "C", lastName: "D"},
            ]);

        assert.equal(fakeContext.messageClient.textMsg[0], "❗Unable to invite member \"C D\" to channel ChannelName. Failed with error message: Unable to find member");

    });

});
