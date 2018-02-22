import {BasicAuthCredentials} from "@atomist/automation-client/operations/common/BasicAuthCredentials";

export interface BitbucketConfig {
    baseUrl: string;
    restUrl: string;
    caPath: string;
    cicdPrivateKeyPath: string;
    cicdKey: string;
    auth: SubatomicAuthCredentials;
}

export interface SubatomicAuthCredentials extends BasicAuthCredentials {
    email: string;
}
