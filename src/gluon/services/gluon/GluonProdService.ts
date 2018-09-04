import {ApplicationProdRequestService} from "./ApplicationProdRequestService";
import {ProjectProdRequestService} from "./ProjectProdRequestService";

export class GluonProdService {
    constructor(public application = new ApplicationProdRequestService(),
                public project = new ProjectProdRequestService()) {
    }
}
