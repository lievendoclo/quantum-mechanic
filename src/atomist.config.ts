import {QMConfig} from "./config/QMConfig";
import {
    ListExistingBitbucketProject,
    NewBitbucketProject,
} from "./gluon/commands/bitbucket/BitbucketProject";
import {KickOffJenkinsBuild} from "./gluon/commands/jenkins/JenkinsBuild";
import {OnboardMember} from "./gluon/commands/member/Onboard";
import {AddSlackDetails} from "./gluon/commands/member/Slack";
import {
    ConfigureBasicPackage,
    ConfigurePackage,
} from "./gluon/commands/packages/ConfigurePackage";
import {
    CreateApplication,
    LinkExistingApplication,
} from "./gluon/commands/packages/CreateApplication";
import {LinkExistingLibrary} from "./gluon/commands/packages/CreateLibrary";
import {AddConfigServer} from "./gluon/commands/project/AddConfigServer";
import {AssociateTeam} from "./gluon/commands/project/AssociateTeam";
import {CreateOpenShiftPvc} from "./gluon/commands/project/CreateOpenShiftPvc";
import {CreateProject} from "./gluon/commands/project/CreateProject";
import {
    ListProjectDetails,
    ListTeamProjects,
} from "./gluon/commands/project/ProjectDetails";
import {NewProjectEnvironments} from "./gluon/commands/project/ProjectEnvironments";
import {CreateTeam} from "./gluon/commands/team/CreateTeam";
import {NewDevOpsEnvironment} from "./gluon/commands/team/DevOpsEnvironment";
import {
    AddMemberToTeam,
    CreateMembershipRequestToTeam,
    JoinTeam,
} from "./gluon/commands/team/JoinTeam";
import {
    LinkExistingTeamSlackChannel,
    NewOrUseTeamSlackChannel,
    NewTeamSlackChannel,
} from "./gluon/commands/team/TeamSlackChannel";
import {BitbucketProjectAdded} from "./gluon/events/bitbucket/BitbucketProjectAdded";
import {BitbucketProjectRequested} from "./gluon/events/bitbucket/BitbucketProjectRequested";
import {TeamMemberCreated} from "./gluon/events/member/TeamMemberCreated";
import {ApplicationCreated} from "./gluon/events/packages/ApplicationCreated";
import {ProjectCreated} from "./gluon/events/project/ProjectCreated";
import {ProjectEnvironmentsRequested} from "./gluon/events/project/ProjectEnvironmentsRequested";
import {TeamsLinkedToProject} from "./gluon/events/project/TeamAssociated";
import {BotJoinedChannel} from "./gluon/events/team/BotJoinedChannel";
import {DevOpsEnvironmentRequested} from "./gluon/events/team/DevOpsEnvironmentRequested";
import {MembersAddedToTeam} from "./gluon/events/team/MembersAddedToTeam";
import {MembershipRequestClosed} from "./gluon/events/team/MembershipRequestClosed";
import {MembershipRequestCreated} from "./gluon/events/team/MembershipRequestCreated";
import {TeamCreated} from "./gluon/events/team/TeamCreated";
import {ApplicationCreatedEvent} from "./gluon/ingesters/applicationsIngester";
import {
    BitbucketProjectAddedEvent,
    BitbucketProjectRequestedEvent,
} from "./gluon/ingesters/bitbucketIngester";
import {
    ProjectCreatedEvent,
    ProjectEnvironmentsRequestedEvent,
    TeamsLinkedToProjectEvent,
} from "./gluon/ingesters/projectIngester";
import {
    ActionedBy,
    BitbucketProject,
    GluonTeam,
    GluonTenant,
    GluonTenantId,
    Project,
    SlackIdentity,
} from "./gluon/ingesters/sharedIngester";
import {
    DevOpsEnvironmentRequestedEvent,
    MembersAddedToTeamEvent,
    MembershipRequestCreatedEvent,
    TeamCreatedEvent,
} from "./gluon/ingesters/teamIngester";
import {TeamMemberCreatedEvent} from "./gluon/ingesters/teamMemberIngester";

const token = QMConfig.token;
const http = QMConfig.http;

export const configuration: any = {
    teamIds: [QMConfig.teamId],
    // running durable will store and forward events when the client is disconnected
    // this should only be used in production envs
    policy: process.env.NODE_ENV === "production" ? "durable" : "ephemeral",
    commands: [
        NewDevOpsEnvironment,
        NewOrUseTeamSlackChannel,
        NewTeamSlackChannel,
        LinkExistingTeamSlackChannel,
        OnboardMember,
        AddSlackDetails,
        JoinTeam,
        AddMemberToTeam,
        AssociateTeam,
        CreateTeam,
        CreateProject,
        NewBitbucketProject,
        NewProjectEnvironments,
        CreateApplication,
        CreateMembershipRequestToTeam,
        MembershipRequestClosed,
        ListExistingBitbucketProject,
        LinkExistingApplication,
        LinkExistingLibrary,
        KickOffJenkinsBuild,
        CreateOpenShiftPvc,
        AddConfigServer,
        ListTeamProjects,
        ListProjectDetails,
        ConfigurePackage,
        ConfigureBasicPackage,
    ],
    events: [
        TeamsLinkedToProject,
        TeamCreated,
        TeamMemberCreated,
        ProjectCreated,
        BitbucketProjectRequested,
        BitbucketProjectAdded,
        DevOpsEnvironmentRequested,
        ProjectEnvironmentsRequested,
        ApplicationCreated,
        MembershipRequestCreated,
        BotJoinedChannel,
        MembersAddedToTeam,
    ],
    ingesters: [
        SlackIdentity,
        GluonTeam,
        TeamCreatedEvent,
        TeamMemberCreatedEvent,
        ProjectCreatedEvent,
        BitbucketProjectRequestedEvent,
        BitbucketProjectAddedEvent,
        DevOpsEnvironmentRequestedEvent,
        ProjectEnvironmentsRequestedEvent,
        ApplicationCreatedEvent,
        MembershipRequestCreatedEvent,
        Project,
        BitbucketProject,
        ActionedBy,
        MembersAddedToTeamEvent,
        GluonTenant,
        GluonTenantId,
        TeamsLinkedToProjectEvent,
    ],
    token,
    http,
    logging: {
        level: "debug",
        file: false,
        banner: true,
    },
    cluster: {
        // This will run the client in cluster mode; master and workers
        enabled: process.env.NODE_ENV === "production",
        workers: 10,
    },
};
