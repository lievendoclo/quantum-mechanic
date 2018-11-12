import {logger} from "@atomist/automation-client";
import {QMConfig} from "../../../config/QMConfig";
import {GluonService} from "../../services/gluon/GluonService";
import {OCService} from "../../services/openshift/OCService";

export class PluginResourceStore {

    public getGluonService() {
        return new GluonService();
    }

    public getLogger() {
        return logger;
    }

    public getOpenShiftService() {
        return new OCService();
    }

    public getConfig() {
        return QMConfig;
    }
}
