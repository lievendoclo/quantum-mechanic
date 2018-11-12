import { ingester } from "@atomist/automation-client/graph/graphQL";
import {QMConfig} from "./config/QMConfig";
import {
    ListExistingBitbucketProject,
    NewBitbucketProject,
} from "./gluon/commands/bitbucket/BitbucketProject";
import {BitbucketProjectAccessCommand} from "./gluon/commands/bitbucket/BitbucketProjectAccessCommand";
import {BitbucketProjectRecommendedPracticesCommand} from "./gluon/commands/bitbucket/BitbucketProjectRecommendedPracticesCommand";
import {KickOffJenkinsBuild} from "./gluon/commands/jenkins/JenkinsBuild";
import {JenkinsCredentialsRecreate} from "./gluon/commands/jenkins/JenkinsCredentialsRecreate";
import {AddSlackDetails} from "./gluon/commands/member/AddSlackDetails";
import {OnboardMember} from "./gluon/commands/member/OnboardMember";
import {ConfigureApplicationJenkinsProd} from "./gluon/commands/packages/ConfigureApplicationJenkinsProd";
import {ConfigureBasicPackage} from "./gluon/commands/packages/ConfigureBasicPackage";
import {ConfigurePackage} from "./gluon/commands/packages/ConfigurePackage";
import {CreateApplicationProd} from "./gluon/commands/packages/CreateApplicationProd";
import {LinkExistingApplication} from "./gluon/commands/packages/LinkExistingApplication";
import {LinkExistingLibrary} from "./gluon/commands/packages/LinkExistingLibrary";
import {PatchBuildConfigBaseImage} from "./gluon/commands/packages/PatchBuildConfigBaseImage";
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
import {AddConfigServer} from "./gluon/commands/team/AddConfigServer";
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
import {RemoveMemberFromTeam} from "./gluon/commands/team/RemoveMemberFromTeam";
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
import {MemberRemovedFromTeam} from "./gluon/events/team/MemberRemovedFromTeam";
import {MembersAddedToTeam} from "./gluon/events/team/MembersAddedToTeam";
import {MembershipRequestClosed} from "./gluon/events/team/MembershipRequestClosed";
import {MembershipRequestCreated} from "./gluon/events/team/MembershipRequestCreated";
import {TeamCreated} from "./gluon/events/team/TeamCreated";
import {Help} from "./gluon/util/help/Help";

const token = QMConfig.token;
const http = QMConfig.http;

export const configuration: any = {
    teamIds: [QMConfig.teamId],
    // running durable will store and forward events when the client is disconnected
    // this should only be used in production envs
    policy: process.env.NODE_ENV === "production" ? "durable" : "ephemeral",
    commands: [
        AddConfigServer,
        AddMemberToTeam,
        AddOwnerToTeam,
        AddSlackDetails,
        AssociateTeam,
        BitbucketProjectAccessCommand,
        BitbucketProjectRecommendedPracticesCommand,
        ConfigureApplicationJenkinsProd,
        ConfigureBasicPackage,
        ConfigurePackage,
        CreateApplicationProd,
        CreateGenericProd,
        CreateMembershipRequestToTeam,
        CreateOpenShiftPvc,
        CreateProject,
        CreateProjectProdEnvironments,
        CreateTeam,
        Help,
        JoinTeam,
        JenkinsCredentialsRecreate,
        KickOffJenkinsBuild,
        LinkExistingApplication,
        LinkExistingLibrary,
        LinkExistingTeamSlackChannel,
        ListExistingBitbucketProject,
        ListProjectDetails,
        ListTeamMembers,
        ListTeamProjects,
        MembershipRequestClosed,
        NewBitbucketProject,
        NewDevOpsEnvironment,
        NewOrUseTeamSlackChannel,
        NewProjectEnvironments,
        NewTeamSlackChannel,
        OnboardMember,
        PatchBuildConfigBaseImage,
        RemoveMemberFromTeam,
        ReRunProjectProdRequest,
        TagAllLatestImages,
        TagLatestImage,
        UpdateProjectProdRequest,
    ],
    events: [
        ApplicationCreated,
        ApplicationProdRequested,
        BitbucketProjectAdded,
        BitbucketProjectRequested,
        BotJoinedChannel,
        DevOpsEnvironmentRequested,
        GenericProdRequested,
        MemberRemovedFromTeam,
        MembersAddedToTeam,
        MembershipRequestCreated,
        ProjectCreated,
        ProjectEnvironmentsRequested,
        ProjectProductionEnvironmentsRequestClosed,
        ProjectProductionEnvironmentsRequested,
        TeamCreated,
        TeamMemberCreated,
        TeamsLinkedToProject,
    ],
    ingesters: [
        ingester("Shared.graphql"),
        ingester("ApplicationCreatedEvent.graphql"),
        ingester("ApplicationProdRequestedEvent.graphql"),
        ingester("BitbucketProjectAddedEvent.graphql"),
        ingester("BitbucketProjectRequestedEvent.graphql"),
        ingester("DevOpsEnvironmentProvisionedEvent.graphql"),
        ingester("DevOpsEnvironmentRequestedEvent.graphql"),
        ingester("GenericProdRequestedEvent.graphql"),
        ingester("MembersAddedToTeamEvent.graphql"),
        ingester("MembershipRequestCreatedEvent.graphql"),
        ingester("PackageConfiguredEvent.graphql"),
        ingester("ProjectCreatedEvent.graphql"),
        ingester("ProjectEnvironmentsRequestedEvent.graphql"),
        ingester("ProjectProductionEnvironmentsRequestClosedEvent.graphql"),
        ingester("ProjectProductionEnvironmentsRequestedEvent.graphql"),
        ingester("TeamCreatedEvent.graphql"),
        ingester("TeamDevOpsDetails.graphql"),
        ingester("TeamMemberCreatedEvent.graphql"),
    ],
    token,
    http,
    logging: {
        level: "debug",
        file: false,
        banner: true,
    },
    cluster: QMConfig.cluster,
    ws: {
        timeout: 20000,
    },
};
