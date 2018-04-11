export interface OpenShiftConfig {
    dockerRepoUrl: string;
    masterUrl: string;
    auth: OpenShiftAuth;
}

export interface OpenShiftAuth {
    token: string;
}
