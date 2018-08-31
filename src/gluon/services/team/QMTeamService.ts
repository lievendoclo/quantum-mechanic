import {GluonService} from "../gluon/GluonService";

export class QMTeamService {

    constructor(private gluonService = new GluonService()) {
    }

    public async isUserMemberOfValidTeam(slackScreenName: string, validTeamIds: string []): Promise<boolean> {
        const teams = await this.gluonService.teams.gluonTeamsWhoSlackScreenNameBelongsTo(slackScreenName, false);
        for (const team of teams) {
            for (const validTeamId of validTeamIds) {
                if (team.teamId === validTeamId) {
                    return true;
                }
            }
        }
        return false;
    }
}
