export interface OpenShiftConfigContract {
    name: string;
    masterUrl: string;
    auth: OpenShiftAuthContract;
    dockerRepoUrl: string;
}

export interface OpenShiftAuthContract {
    token: string;
}
