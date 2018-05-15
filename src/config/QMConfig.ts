import * as config from "config";
import {HttpAuth} from "./HttpAuth";
import {SubatomicConfig} from "./SubatomicConfig";

export class QMConfig {

    public static subatomic: SubatomicConfig = config.get("subatomic");

    public static teamId: string = config.get("teamId");

    public static token: string = config.get("token");

    public static http: HttpAuth = config.get("http");

}
