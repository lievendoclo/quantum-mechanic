import {BasicAuthCredentials} from "@atomist/automation-client/operations/common/BasicAuthCredentials";

export interface BitbucketConfig {
    baseUrl: string;
    restUrl: string;
    caPath: string;
    cicdPrivateKeyPath: string;
    cicdKey: string;
    auth: SubatomicAuthCredentials;
    sshPort: number;
}

export interface SubatomicAuthCredentials extends BasicAuthCredentials {
    email: string;
    username: string;
    password: string;
}
