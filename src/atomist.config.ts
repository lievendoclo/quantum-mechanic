import * as appRoot from "app-root-path";
import * as config from "config";
import {ApplicationCreated} from "./gluon/application/ApplicationCreated";
import {ApplicationCreatedEvent} from "./gluon/application/applicationsIngester";
import {CreateApplication} from "./gluon/application/CreateApplication";
import {
    BitbucketProjectAddedEvent,
    BitbucketProjectRequestedEvent,
} from "./gluon/bitbucket/bitbucketIngester";
import {NewBitbucketProject} from "./gluon/bitbucket/BitbucketProject";
import {BitbucketProjectAdded} from "./gluon/bitbucket/BitbucketProjectAdded";
import {BitbucketProjectRequested} from "./gluon/bitbucket/BitbucketProjectRequested";
import {OnboardMember} from "./gluon/member/Onboard";
import {AddSlackDetails, Whoami} from "./gluon/member/Slack";
import {TeamMemberCreated} from "./gluon/member/TeamMemberCreated";
import {TeamMemberCreatedEvent} from "./gluon/member/teamMemberIngester";
import {CreateProject} from "./gluon/project/CreateProject";
import {ProjectCreated} from "./gluon/project/ProjectCreated";
import {NewProjectEnvironments} from "./gluon/project/ProjectEnvironments";
import {ProjectEnvironmentsRequested} from "./gluon/project/ProjectEnvironmentsRequested";
import {
    ProjectCreatedEvent,
    ProjectEnvironmentsRequestedEvent,
} from "./gluon/project/projectIngester";
import {SlackIdentity, Team} from "./gluon/shared/sharedIngester";
import {CreateTeam} from "./gluon/team/CreateTeam";
import {NewDevOpsEnvironment} from "./gluon/team/DevOpsEnvironment";
import {DevOpsEnvironmentRequested} from "./gluon/team/DevOpsEnvironmentRequested";
import {
    AddMemberToTeam,
    CreateMembershipRequestToTeam,
    JoinTeam,
} from "./gluon/team/JoinTeam";
import {MembershipRequestClosed} from "./gluon/team/MembershipRequestClosed";
import {MembershipRequestCreated} from "./gluon/team/MembershipRequestCreated";
import {TeamCreated} from "./gluon/team/TeamCreated";
import {
    DevOpsEnvironmentRequestedEvent,
    MembershipRequestCreatedEvent,
    TeamCreatedEvent,
} from "./gluon/team/teamIngester";
import {
    LinkExistingTeamSlackChannel,
    NewOrUseTeamSlackChannel,
    NewTeamSlackChannel,
} from "./gluon/team/TeamSlackChannel";

const pj = require(`${appRoot.path}/package.json`);

const token = config.get("token");

export const configuration: any = {
    name: pj.name,
    version: pj.version,
    teamIds: [config.get("teamId")],
    commands: [
        NewDevOpsEnvironment,
        NewOrUseTeamSlackChannel,
        NewTeamSlackChannel,
        LinkExistingTeamSlackChannel,
        OnboardMember,
        AddSlackDetails,
        JoinTeam,
        AddMemberToTeam,
        CreateTeam,
        CreateProject,
        NewBitbucketProject,
        NewProjectEnvironments,
        CreateApplication,
        Whoami,
        CreateMembershipRequestToTeam,
        MembershipRequestClosed,
    ],
    events: [
        TeamCreated,
        TeamMemberCreated,
        ProjectCreated,
        BitbucketProjectRequested,
        BitbucketProjectAdded,
        DevOpsEnvironmentRequested,
        ProjectEnvironmentsRequested,
        ApplicationCreated,
        MembershipRequestCreated,
    ],
    ingesters: [
        SlackIdentity,
        Team,
        TeamCreatedEvent,
        TeamMemberCreatedEvent,
        ProjectCreatedEvent,
        BitbucketProjectRequestedEvent,
        BitbucketProjectAddedEvent,
        DevOpsEnvironmentRequestedEvent,
        ProjectEnvironmentsRequestedEvent,
        ApplicationCreatedEvent,
        MembershipRequestCreatedEvent,
    ],
    token,
    http: {
        enabled: true,
        auth: {
            basic: {
                enabled: false,
            },
            bearer: {
                enabled: false,
            },
        },
    },
};
