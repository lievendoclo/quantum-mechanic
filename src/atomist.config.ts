import * as appRoot from "app-root-path";
import {
    DevOpsEnvironmentRequestedEvent,
    TeamCreatedEvent
} from "./gluon/team/teamIngester";
import {TeamCreated} from "./gluon/team/TeamCreated";
import {NewDevOpsEnvironment} from "./gluon/team/DevOpsEnvironment";
import {
    NewOrUseTeamSlackChannel,
    NewTeamSlackChannel
} from "./gluon/team/TeamSlackChannel";
import {OnboardMember} from "./gluon/member/Onboard";
import {AddMemberToTeam, JoinTeam} from "./gluon/team/JoinTeam";
import {TeamMemberCreated} from "./gluon/member/TeamMemberCreated";
import {TeamMemberCreatedEvent} from "./gluon/member/teamMemberIngester";
import {AddSlackDetails, Whoami} from "./gluon/member/Slack";
import {CreateTeam} from "./gluon/team/CreateTeam";
import {ProjectCreated} from "./gluon/project/ProjectCreated";
import {
    ProjectCreatedEvent,
    ProjectEnvironmentsRequestedEvent
} from "./gluon/project/projectIngester";
import {ApplicationCreatedEvent} from "./gluon/application/applicationsIngester";
import {ApplicationCreated} from "./gluon/application/ApplicationCreated";
import {CreateProject} from "./gluon/project/CreateProject";
import {SlackIdentity, Team} from "./gluon/shared/sharedIngester";
import {
    BitbucketProjectAddedEvent,
    BitbucketProjectRequestedEvent
} from "./gluon/bitbucket/bitbucketIngester";
import {BitbucketProjectRequested} from "./gluon/bitbucket/BitbucketProjectRequested";
import {NewBitbucketProject} from "./gluon/bitbucket/BitbucketProject";
import {BitbucketProjectAdded} from "./gluon/bitbucket/BitbucketProjectAdded";
import {ProjectEnvironmentsRequested} from "./gluon/project/ProjectEnvironmentsRequested";
import {DevOpsEnvironmentRequested} from "./gluon/team/DevOpsEnvironmentRequested";
import {NewProjectEnvironments} from "./gluon/project/ProjectEnvironments";
import {CreateApplication} from "./gluon/application/CreateApplication";
import * as config from "config";
import {secret} from "@atomist/lifecycle-automation/util/secrets";

const pj = require(`${appRoot.path}/package.json`);

const token = secret("github.token", process.env.GITHUB_TOKEN);

export const configuration: any = {
    name: pj.name,
    version: pj.version,
    teamIds: config.get("teamIds"),
    commands: [
        NewDevOpsEnvironment,
        NewOrUseTeamSlackChannel,
        NewTeamSlackChannel,
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
