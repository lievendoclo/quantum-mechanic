import {ApplicationService} from "./ApplicationService";
import {MemberService} from "./MemberService";
import {ProjectService} from "./ProjectService";
import {TeamService} from "./TeamService";
import {TenantService} from "./TenantService";

export class GluonService {
    constructor(public teams = new TeamService(),
                public members = new MemberService(),
                public applications = new ApplicationService(),
                public projects = new ProjectService(),
                public tenants = new TenantService()) {
    }
}
