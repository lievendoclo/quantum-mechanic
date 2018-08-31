import assert = require("power-assert");
import {anything, instance, mock, verify, when} from "ts-mockito";
import {GluonService} from "../../../../src/gluon/services/gluon/GluonService";
import {MemberService} from "../../../../src/gluon/services/gluon/MemberService";
import {TeamService} from "../../../../src/gluon/services/gluon/TeamService";
import {AddMemberToTeamService} from "../../../../src/gluon/services/team/AddMemberToTeamService";
import {QMError} from "../../../../src/gluon/util/shared/Error";
import {TestGraphClient} from "../../TestGraphClient";
import {TestMessageClient} from "../../TestMessageClient";

describe("AddMemberToTeamService getNewMember", () => {
    it("should return error that member is part of team already", async () => {
        const mockedMemberService = mock(MemberService);
        when(mockedMemberService.gluonMemberFromScreenName("Dex")).thenReturn(Promise.resolve({
            id: "User1",
            teams: [
                {
                    slack: {
                        teamChannel: "Channel1",
                    },
                },
            ],
            slack: {
                screenName: "Dex",
            },
        }));
        const gluonService = new GluonService(undefined, undefined, instance(mockedMemberService));
        const service = new AddMemberToTeamService(gluonService);

        let errorThrown: QMError = null;
        try {
            await service.getNewMember("Dex", "Channel1");
        } catch (error) {
            errorThrown = error;
        }

        assert.equal(errorThrown.message, `Dex is already a member of this team.`);

    });

    it("should return member details", async () => {
        const mockedMemberService = mock(MemberService);
        when(mockedMemberService.gluonMemberFromScreenName("Dex")).thenReturn(Promise.resolve({
            id: "User1",
            teams: [
                {
                    slack: {
                        teamChannel: "Channel1",
                    },
                },
            ],
            slack: {
                screenName: "Dex",
            },
        }));
        const gluonService = new GluonService(undefined, undefined, instance(mockedMemberService));
        const service = new AddMemberToTeamService(gluonService);

        const result = await service.getNewMember("Dex", "Channel2");

        assert.equal(result.id, "User1");

    });
});

describe("AddMemberToTeamService addUserToGluonTeam", () => {
    it("should fail to add member to gluon team", async () => {
        const mockedTeamService = mock(TeamService);
        when(mockedTeamService.addMemberToTeam("team1", anything())).thenReturn(Promise.resolve({
            status: 400,
        }));
        const gluonService = new GluonService(undefined, instance(mockedTeamService));
        const service = new AddMemberToTeamService(gluonService);

        let errorThrown: QMError = null;
        try {
            await service.addUserToGluonTeam("User1", "User2", "http://gluon/teams/team1");
        } catch (error) {
            errorThrown = error;
        }

        assert.equal(errorThrown.message, `Failed to add member to the team. Server side failure.`);

    });

    it("should extract the correct gluon team id from url", async () => {
        const mockedTeamService = mock(TeamService);
        when(mockedTeamService.addMemberToTeam("team1", anything())).thenReturn(Promise.resolve({
            status: 200,
        }));
        const gluonService = new GluonService(undefined, instance(mockedTeamService));
        const service = new AddMemberToTeamService(gluonService);

        await service.addUserToGluonTeam("User1", "User2", "http://gluon/teams/team1");

        verify(mockedTeamService.addMemberToTeam("team1", anything())).called();
    });

    it("should successfully execute gluon add", async () => {
        const mockedTeamService = mock(TeamService);
        when(mockedTeamService.addMemberToTeam("team1", anything())).thenReturn(Promise.resolve({
            status: 200,
        }));
        const gluonService = new GluonService(undefined, instance(mockedTeamService));
        const service = new AddMemberToTeamService(gluonService);

        let errorThrown: boolean = false;
        try {
            await service.addUserToGluonTeam("User1", "User2", "http://gluon/teams/team1");
        } catch (error) {
            errorThrown = true;
        }

        assert.equal(errorThrown, false);

    });
});

describe("AddMemberToTeamService inviteUserToSlackChannel", () => {
    it("should fail to invite user to private channel", async () => {

        const service = new AddMemberToTeamService();

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            workspaceId: "2341234123",
            messageClient: new TestMessageClient(),
            graphClient: new TestGraphClient(),
        };

        // Force invite to fail
        fakeContext.graphClient.executeMutationResults.push({result: false});

        await service.inviteUserToSlackChannel(fakeContext,
            "Jude",
            "action1",
            "channel1",
            "channe1id",
            "Howard",
            "team1",
            "channel2id",
            "jude",
        );

        assert.equal(fakeContext.messageClient.textMsg[0], "User jude successfully added to your gluon team." +
            " Private channels do not currently support automatic user invitation." +
            " Please invite the user to this slack channel manually.");

    });

    it("should successfully invite user to channel", async () => {

        const service = new AddMemberToTeamService();

        const fakeContext = {
            teamId: "TEST",
            correlationId: "1231343234234",
            workspaceId: "2341234123",
            messageClient: new TestMessageClient(),
            graphClient: new TestGraphClient(),
        };

        await service.inviteUserToSlackChannel(fakeContext,
            "Jude",
            "action1",
            "channel1",
            "channe1id",
            "Howard",
            "team1",
            "channel2id",
            "jude",
        );

        assert.equal(fakeContext.messageClient.textMsg[0].text, "Welcome to the team *Jude*!");

    });
});
