export class GluonToEvent {

    public static application(gluonApplication) {
        return {
            applicationId: gluonApplication.applicationId,
            name: gluonApplication.name,
            description: gluonApplication.description,
            applicationType: gluonApplication.applicationType,
        };
    }

    public static project(gluonProject) {
        return {
            projectId: gluonProject.projectId,
            name: gluonProject.name,
            description: gluonProject.description,
        };
    }

    public static bitbucketRepository(gluonApplication) {
        return {
            bitbucketId: gluonApplication.bitbucketRepository.bitbucketId,
            name: gluonApplication.bitbucketRepository.name,
            repoUrl: gluonApplication.bitbucketRepository.repoUrl,
            remoteUrl: gluonApplication.bitbucketRepository.remoteUrl,
        };
    }

    public static bitbucketProject(gluonProject) {
        return {
            projectId: gluonProject.bitbucketProject.projectId,
            name: gluonProject.bitbucketProject.name,
            description: gluonProject.bitbucketProject.description,
            url: gluonProject.bitbucketProject.url,
            key: gluonProject.bitbucketProject.key,
        };
    }

    public static teamMinimal(gluonTeam) {
        return {
            teamId: gluonTeam.teamId,
            name: gluonTeam.name,
            slackIdentity: gluonTeam.slack,
        };
    }

    public static team(gluonTeamFull) {
        return {
            teamId: gluonTeamFull.teamId,
            name: gluonTeamFull.name,
            slackIdentity: gluonTeamFull.slack,
            owners: gluonTeamFull.owners,
            members: gluonTeamFull.members,
        };
    }

    public static member(gluonMember) {
        return {
            memberId: gluonMember.memberId,
            firstName: gluonMember.firstName,
            lastName: gluonMember.lastName,
            email: gluonMember.email,
            domainUsername: gluonMember.domainUsername,
            slackIdentity: gluonMember.slack,
        };
    }
}
