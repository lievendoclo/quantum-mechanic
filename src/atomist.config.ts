import {QMConfig} from "./config/QMConfig";
import {
    ListExistingBitbucketProject,
    NewBitbucketProject,
} from "./gluon/commands/bitbucket/BitbucketProject";
import {KickOffJenkinsBuild} from "./gluon/commands/jenkins/JenkinsBuild";
import {AddSlackDetails} from "./gluon/commands/member/AddSlackDetails";
import {OnboardMember} from "./gluon/commands/member/OnboardMember";
import {ConfigureBasicPackage} from "./gluon/commands/packages/ConfigureBasicPackage";
import {ConfigurePackage} from "./gluon/commands/packages/ConfigurePackage";
import {CreateApplicationProd} from "./gluon/commands/packages/CreateApplicationProd";
import {LinkExistingApplication} from "./gluon/commands/packages/LinkExistingApplication";
import {LinkExistingLibrary} from "./gluon/commands/packages/LinkExistingLibrary";
import {PatchBuildConfigBaseImage} from "./gluon/commands/packages/PatchBuildConfigBaseImage";
import {AddConfigServer} from "./gluon/commands/project/AddConfigServer";
import {AssociateTeam} from "./gluon/commands/project/AssociateTeam";
import {CreateGenericProd} from "./gluon/commands/project/CreateGenericProd";
import {CreateOpenShiftPvc} from "./gluon/commands/project/CreateOpenShiftPvc";
import {CreateProject} from "./gluon/commands/project/CreateProject";
import {CreateProjectProdEnvironments} from "./gluon/commands/project/CreateProjectProdEnvironments";
import {NewProjectEnvironments} from "./gluon/commands/project/NewProjectEnvironments";
import {
    ListProjectDetails,
    ListTeamProjects,
} from "./gluon/commands/project/ProjectDetails";
import {ReRunProjectProdRequest} from "./gluon/commands/project/ReRunProjectProdRequest";
import {UpdateProjectProdRequest} from "./gluon/commands/project/UpdateProjectProdRequest";
import {AddMemberToTeam} from "./gluon/commands/team/AddMemberToTeam";
import {AddOwnerToTeam} from "./gluon/commands/team/AddOwnerToTeam";
import {CreateMembershipRequestToTeam} from "./gluon/commands/team/CreateMembershipRequestToTeam";
import {CreateTeam} from "./gluon/commands/team/CreateTeam";
import {NewDevOpsEnvironment} from "./gluon/commands/team/DevOpsEnvironment";
import {JoinTeam} from "./gluon/commands/team/JoinTeam";
import {LinkExistingTeamSlackChannel} from "./gluon/commands/team/LinkExistingTeamSlackChannel";
import {ListTeamMembers} from "./gluon/commands/team/ListTeamMembers";
import {NewOrUseTeamSlackChannel} from "./gluon/commands/team/NewOrExistingTeamSlackChannel";
import {NewTeamSlackChannel} from "./gluon/commands/team/NewSlackChannel";
import {TagAllLatestImages} from "./gluon/commands/team/TagAllLatestImages";
import {TagLatestImage} from "./gluon/commands/team/TagLatestImage";
import {BitbucketProjectAdded} from "./gluon/events/bitbucket/BitbucketProjectAdded";
import {BitbucketProjectRequested} from "./gluon/events/bitbucket/BitbucketProjectRequested";
import {TeamMemberCreated} from "./gluon/events/member/TeamMemberCreated";
import {ApplicationCreated} from "./gluon/events/packages/ApplicationCreated";
import {ApplicationProdRequested} from "./gluon/events/packages/ApplicationProdRequested";
import {GenericProdRequested} from "./gluon/events/project/GenericProdRequested";
import {ProjectCreated} from "./gluon/events/project/ProjectCreated";
import {ProjectEnvironmentsRequested} from "./gluon/events/project/ProjectEnvironmentsRequested";
import {ProjectProductionEnvironmentsRequestClosed} from "./gluon/events/project/ProjectProductionEnvironmentsRequestClosed";
import {ProjectProductionEnvironmentsRequested} from "./gluon/events/project/ProjectProductionEnvironmentsRequested";
import {TeamsLinkedToProject} from "./gluon/events/project/TeamAssociated";
import {BotJoinedChannel} from "./gluon/events/team/BotJoinedChannel";
import {DevOpsEnvironmentRequested} from "./gluon/events/team/DevOpsEnvironmentRequested";
import {MembersAddedToTeam} from "./gluon/events/team/MembersAddedToTeam";
import {MembershipRequestClosed} from "./gluon/events/team/MembershipRequestClosed";
import {MembershipRequestCreated} from "./gluon/events/team/MembershipRequestCreated";
import {TeamCreated} from "./gluon/events/team/TeamCreated";
import {ApplicationProdRequestedEvent} from "./gluon/ingesters/applicationProdRequested";
import {
    ApplicationCreatedEvent,
    PackageConfiguredEvent,
} from "./gluon/ingesters/applicationsIngester";
import {
    BitbucketProjectAddedEvent,
    BitbucketProjectRequestedEvent,
} from "./gluon/ingesters/bitbucketIngester";
import {GenericProdRequestedEvent} from "./gluon/ingesters/genericProdRequested";
import {
    ProjectCreatedEvent,
    ProjectEnvironmentsRequestedEvent,
    TeamsLinkedToProjectEvent,
} from "./gluon/ingesters/projectIngester";
import {
    ProjectProductionEnvironmentsRequestClosedEvent,
    ProjectProductionEnvironmentsRequestedEvent,
} from "./gluon/ingesters/projectProductionRequests";
import {
    ActionedBy,
    BitbucketProject,
    BitbucketRepository,
    DevOpsEnvironmentDetails,
    GluonApplication,
    GluonTeam,
    GluonTenant,
    GluonTenantId,
    Project,
    SlackIdentity,
} from "./gluon/ingesters/sharedIngester";
import {TeamDevOpsDetails} from "./gluon/ingesters/teamDevOpsDetails";
import {
    DevOpsEnvironmentProvisionedEvent,
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
        AddOwnerToTeam,
        AssociateTeam,
        CreateTeam,
        CreateProject,
        NewBitbucketProject,
        NewProjectEnvironments,
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
        ListTeamMembers,
        ConfigurePackage,
        ConfigureBasicPackage,
        TagAllLatestImages,
        TagLatestImage,
        CreateProjectProdEnvironments,
        CreateApplicationProd,
        UpdateProjectProdRequest,
        CreateGenericProd,
        ReRunProjectProdRequest,
        PatchBuildConfigBaseImage,
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
        ProjectProductionEnvironmentsRequested,
        ApplicationProdRequested,
        ProjectProductionEnvironmentsRequestClosed,
        GenericProdRequested,
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
        ProjectProductionEnvironmentsRequestedEvent,
        ProjectProductionEnvironmentsRequestClosedEvent,
        ApplicationCreatedEvent,
        MembershipRequestCreatedEvent,
        Project,
        BitbucketProject,
        BitbucketRepository,
        ActionedBy,
        MembersAddedToTeamEvent,
        GluonTenant,
        GluonTenantId,
        TeamsLinkedToProjectEvent,
        DevOpsEnvironmentProvisionedEvent,
        DevOpsEnvironmentDetails,
        PackageConfiguredEvent,
        TeamDevOpsDetails,
        GluonApplication,
        ApplicationProdRequestedEvent,
        GenericProdRequestedEvent,
    ],
    token,
    http,
    logging: {
        level: "debug",
        file: false,
        banner: true,
    },
    cluster: QMConfig.cluster,
};
