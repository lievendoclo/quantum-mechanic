import {BasicAuthCredentials} from "@atomist/automation-client/operations/common/BasicAuthCredentials";

export interface BitbucketConfig {
    baseUrl: string;
    ca: string;
    cicdKey: string;
    auth: BasicAuthCredentials;
}
