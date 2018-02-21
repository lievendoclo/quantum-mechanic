export interface OpenShiftConfig {
    masterUrl: string;
    auth: OpenShiftAuth;
}

export interface OpenShiftAuth {
    token: string;
}
