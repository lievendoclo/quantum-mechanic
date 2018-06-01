import * as config from "config";
import _ = require("lodash");
import {HttpAuth} from "./HttpAuth";
import {SubatomicConfig} from "./SubatomicConfig";

export class QMConfig {

    public static subatomic: SubatomicConfig = config.get("subatomic");

    public static teamId: string = config.get("teamId");

    public static token: string = config.get("token");

    public static http: HttpAuth = config.get("http");

    public static publicConfig() {
        return new PublicQMConfig();
    }

}

export class PublicQMConfig {

    public subatomic: SubatomicConfig = _.cloneDeep(config.get("subatomic"));

    public teamId: string = _.cloneDeep(config.get("teamId"));

    constructor() {
        this.subatomic.bitbucket.auth.email = "";
        this.subatomic.bitbucket.auth.password = "";
        this.subatomic.bitbucket.auth.username = "";
        this.subatomic.bitbucket.cicdKey = "";
        this.subatomic.bitbucket.cicdPrivateKeyPath = "";
        this.subatomic.bitbucket.caPath = "";
        this.subatomic.openshift.auth.token = "";
    }
}
