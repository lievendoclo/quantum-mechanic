import * as _ from "lodash";
import {
    ListExistingBitbucketProject,
    NewBitbucketProject,
} from "../../commands/bitbucket/BitbucketProject";
import {BitbucketProjectAccessCommand} from "../../commands/bitbucket/BitbucketProjectAccessCommand";
import {BitbucketProjectRecommendedPracticesCommand} from "../../commands/bitbucket/BitbucketProjectRecommendedPracticesCommand";
import {KickOffJenkinsBuild} from "../../commands/jenkins/JenkinsBuild";
import {AddSlackDetails} from "../../commands/member/AddSlackDetails";
import {OnboardMember} from "../../commands/member/OnboardMember";
import {ConfigureApplicationJenkinsProd} from "../../commands/packages/ConfigureApplicationJenkinsProd";
import {ConfigureBasicPackage} from "../../commands/packages/ConfigureBasicPackage";
import {ConfigurePackage} from "../../commands/packages/ConfigurePackage";
import {CreateApplicationProd} from "../../commands/packages/CreateApplicationProd";
import {LinkExistingApplication} from "../../commands/packages/LinkExistingApplication";
import {LinkExistingLibrary} from "../../commands/packages/LinkExistingLibrary";
import {PatchBuildConfigBaseImage} from "../../commands/packages/PatchBuildConfigBaseImage";
import {AssociateTeam} from "../../commands/project/AssociateTeam";
import {CreateGenericProd} from "../../commands/project/CreateGenericProd";
import {CreateOpenShiftPvc} from "../../commands/project/CreateOpenShiftPvc";
import {CreateProject} from "../../commands/project/CreateProject";
import {CreateProjectProdEnvironments} from "../../commands/project/CreateProjectProdEnvironments";
import {NewProjectEnvironments} from "../../commands/project/NewProjectEnvironments";
import {
    ListProjectDetails,
    ListTeamProjects,
} from "../../commands/project/ProjectDetails";
import {ReRunProjectProdRequest} from "../../commands/project/ReRunProjectProdRequest";
import {UpdateProjectProdRequest} from "../../commands/project/UpdateProjectProdRequest";
import {AddConfigServer} from "../../commands/team/AddConfigServer";
import {AddMemberToTeam} from "../../commands/team/AddMemberToTeam";
import {AddOwnerToTeam} from "../../commands/team/AddOwnerToTeam";
import {CreateMembershipRequestToTeam} from "../../commands/team/CreateMembershipRequestToTeam";
import {CreateTeam} from "../../commands/team/CreateTeam";
import {NewDevOpsEnvironment} from "../../commands/team/DevOpsEnvironment";
import {JoinTeam} from "../../commands/team/JoinTeam";
import {LinkExistingTeamSlackChannel} from "../../commands/team/LinkExistingTeamSlackChannel";
import {ListTeamMembers} from "../../commands/team/ListTeamMembers";
import {NewOrUseTeamSlackChannel} from "../../commands/team/NewOrExistingTeamSlackChannel";
import {NewTeamSlackChannel} from "../../commands/team/NewSlackChannel";
import {TagAllLatestImages} from "../../commands/team/TagAllLatestImages";
import {TagLatestImage} from "../../commands/team/TagLatestImage";
import {MembershipRequestClosed} from "../../events/team/MembershipRequestClosed";

export class HelpCategory {

    private commands: any[] = [];
    private allCommands = [
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
        BitbucketProjectAccessCommand,
        BitbucketProjectRecommendedPracticesCommand,
        ConfigureApplicationJenkinsProd,
    ];

    constructor(protected name, protected description, protected tags: string) {
    }

    public getHelpName() {
        return this.name;
    }

    public getHelpDescription() {
        return this.description;
    }

    public findListOfCommands(commandTag: string): any[] {
        for (const command of this.allCommands) {
            const classTag = this.getCommandMetadata(command.prototype);
            for (const tag of classTag.tags) {
                if (_.isEmpty(tag)) {
                    break;
                }
                if (this.forceCast<Tag>(tag).name === commandTag) {
                    this.commands.push(command);
                }
            }
        }
        return this.commands;
    }

    public findCommandByName(commandName: string) {
        for (const command of this.allCommands) {
            const commandMetaData = this.getCommandMetadata(command.prototype);

            if (commandMetaData.name === commandName) {
                return command;
            }
        }
        return null;
    }

    private getCommandMetadata(commandPrototype: any): { tags: string[], name: string } {
        if (commandPrototype.__tags === undefined) {
            return {
                tags: [],
                name: commandPrototype.__name,
            };
        }
        return {
            tags: commandPrototype.__tags,
            name: commandPrototype.__name,
        };
    }

    private forceCast<T>(input: any): T {
        return input;
    }

}

interface Tag {
    name: string;
    description: string;
}
