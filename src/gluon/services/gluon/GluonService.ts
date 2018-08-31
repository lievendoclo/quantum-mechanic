import {AwaitAxios} from "../../util/shared/AwaitAxios";
import {ApplicationService} from "./ApplicationService";
import {GluonProdService} from "./GluonProdService";
import {MemberService} from "./MemberService";
import {ProjectService} from "./ProjectService";
import {TeamService} from "./TeamService";
import {TenantService} from "./TenantService";

export class GluonService {
    constructor(public axiosInstance = new AwaitAxios(),
                public teams = new TeamService(axiosInstance),
                public members = new MemberService(axiosInstance),
                public applications = new ApplicationService(),
                public projects = new ProjectService(),
                public tenants = new TenantService(),
                public prod = new GluonProdService()) {
    }
}
