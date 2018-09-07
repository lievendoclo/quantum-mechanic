import {ApplicationProdRequestService} from "./ApplicationProdRequestService";
import {GenericProdRequestService} from "./GenericProdRequestService";
import {ProjectProdRequestService} from "./ProjectProdRequestService";

export class GluonProdService {
    constructor(public application = new ApplicationProdRequestService(),
                public project = new ProjectProdRequestService(),
                public generic = new GenericProdRequestService()) {
    }
}
