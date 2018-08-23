import {logger} from "@atomist/automation-client";
import fs = require("fs");
import _ = require("lodash");
import stripJsonComments = require("strip-json-comments");
import {Cluster} from "./Cluster";
import {HttpAuth} from "./HttpAuth";
import {SubatomicConfig} from "./SubatomicConfig";

export class QMConfig {

    public static subatomic: SubatomicConfig;

    public static teamId: string;

    public static token: string;

    public static http: HttpAuth;

    public static cluster: Cluster;

    public static publicConfig() {
        return new PublicQMConfig();
    }

    public static initialize() {
        const configRaw = stripJsonComments(fs.readFileSync(this.getConfigFile()).toString());
        const config = JSON.parse(configRaw);
        QMConfig.subatomic = config.subatomic;
        QMConfig.teamId = config.teamId;
        QMConfig.token = config.token;
        QMConfig.http = config.http;
        QMConfig.cluster = config.cluster || {
            enabled: process.env.NODE_ENV === "production",
            workers: 10,
        };
    }

    private static getConfigFile() {
        let configFile = "";
        logger.info(`Searching folder: config/`);
        fs.readdirSync(`config/`).forEach(file => {
            logger.info(`Found file: ${file}`);
            if (file.endsWith("local.json")) {
                configFile = file;
            } else if (file.endsWith("config.json") && configFile !== "local.json") {
                configFile = file;
            } else if (file.endsWith(".json") && configFile === "") {
                configFile = file;
            }
        });
        if (configFile === "") {
            logger.error("Failed to read config file in config/ directory. Exiting.");
            process.exit(1);
        }
        logger.info(`Using config file: ${configFile}`);
        return `config/${configFile}`;
    }

}

export class PublicQMConfig {

    public subatomic: SubatomicConfig = _.cloneDeep(QMConfig.subatomic);

    public teamId: string = _.cloneDeep(QMConfig.teamId);

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

QMConfig.initialize();
