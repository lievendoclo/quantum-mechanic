import {QMConfig} from "./config/QMConfig";
import {
    BitbucketProjectAddedEvent,
    BitbucketProjectRequestedEvent,
} from "./gluon/bitbucket/bitbucketIngester";
import {
    ListExistingBitbucketProject,
    NewBitbucketProject,
} from "./gluon/bitbucket/BitbucketProject";
import {BitbucketProjectAdded} from "./gluon/bitbucket/BitbucketProjectAdded";
import {BitbucketProjectRequested} from "./gluon/bitbucket/BitbucketProjectRequested";
import {KickOffJenkinsBuild} from "./gluon/jenkins/JenkinsBuild";
import {OnboardMember} from "./gluon/member/Onboard";
import {AddSlackDetails, Whoami} from "./gluon/member/Slack";
import {TeamMemberCreated} from "./gluon/member/TeamMemberCreated";
import {TeamMemberCreatedEvent} from "./gluon/member/teamMemberIngester";
import {ApplicationCreated} from "./gluon/packages/ApplicationCreated";
import {ApplicationCreatedEvent} from "./gluon/packages/applicationsIngester";
import {ConfigureComponent} from "./gluon/packages/ConfigureComponent";
import {
    CreateApplication,
    LinkExistingApplication,
} from "./gluon/packages/CreateApplication";
import {LinkExistingLibrary} from "./gluon/packages/CreateLibrary";
import {AddConfigServer} from "./gluon/project/AddConfigServer";
import {CreateOpenShiftPvc} from "./gluon/project/CreateOpenShiftPvc";
import {CreateProject} from "./gluon/project/CreateProject";
import {ProjectCreated} from "./gluon/project/ProjectCreated";
import {
    ListProjectDetails,
    ListTeamProjects,
} from "./gluon/project/ProjectDetails";
import {NewProjectEnvironments} from "./gluon/project/ProjectEnvironments";
import {ProjectEnvironmentsRequested} from "./gluon/project/ProjectEnvironmentsRequested";
import {
    ProjectCreatedEvent,
    ProjectEnvironmentsRequestedEvent,
} from "./gluon/project/projectIngester";
import {
    ActionedBy,
    BitbucketProject,
    GluonTeam,
    GluonTenant,
    GluonTenantId,
    Project,
    SlackIdentity,
} from "./gluon/shared/sharedIngester";
import {BotJoinedChannel} from "./gluon/team/BotJoinedChannel";
import {CreateTeam} from "./gluon/team/CreateTeam";
import {NewDevOpsEnvironment} from "./gluon/team/DevOpsEnvironment";
import {DevOpsEnvironmentRequested} from "./gluon/team/DevOpsEnvironmentRequested";
import {
    AddMemberToTeam,
    CreateMembershipRequestToTeam,
    JoinTeam,
} from "./gluon/team/JoinTeam";
import {MembersAddedToTeam} from "./gluon/team/MembersAddedToTeam";
import {MembershipRequestClosed} from "./gluon/team/MembershipRequestClosed";
import {MembershipRequestCreated} from "./gluon/team/MembershipRequestCreated";
import {TeamCreated} from "./gluon/team/TeamCreated";
import {
    DevOpsEnvironmentRequestedEvent,
    MembersAddedToTeamEvent,
    MembershipRequestCreatedEvent,
    TeamCreatedEvent,
} from "./gluon/team/teamIngester";
import {
    LinkExistingTeamSlackChannel,
    NewOrUseTeamSlackChannel,
    NewTeamSlackChannel,
} from "./gluon/team/TeamSlackChannel";

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
        CreateTeam,
        CreateProject,
        NewBitbucketProject,
        NewProjectEnvironments,
        CreateApplication,
        Whoami,
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
        ConfigureComponent,
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
    },
};
