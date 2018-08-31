import {ApplicationProdRequestService} from "./ApplicationProdRequestService";

export class GluonProdService {
    constructor(public application = new ApplicationProdRequestService()) {
    }
}
