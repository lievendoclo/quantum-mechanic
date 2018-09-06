import {logger} from "@atomist/automation-client";
import {inspect} from "util";
import {OpenshiftResource} from "../../../openshift/api/resources/OpenshiftResource";

export class OpaqueSecret implements OpenshiftResource {

    public apiVersion: string = "v1";
    public kind: string = "Secret";
    public metadata: { [p: string]: any } = {};
    public type: string = "Opaque";
    public data: { [p: string]: string } = {};

    constructor(name: string) {
        this.metadata.name = name;
    }

    public addLiteral(key: string, value: string): void {
        this.data[key] = Buffer.from(value).toString("base64");
    }

    public addFile(key: string, filePath: string): void {
        try {
            const fs = require("fs");
            const buffer = fs.readFileSync(filePath);
            this.data[key] = buffer.toString("base64");
        } catch (error) {
            logger.error(`Failed to read file: ${inspect(error)}`);
            throw error;
        }
    }
}
