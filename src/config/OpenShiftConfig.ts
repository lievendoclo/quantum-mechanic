export interface OpenShiftConfig {
    name: string;
    dockerRepoUrl: string;
    masterUrl: string;
    auth: OpenShiftAuth;
    defaultEnvironments: OpenshiftProjectEnvironment[];
}

export interface OpenShiftAuth {
    token: string;
}

export interface OpenshiftProjectEnvironment {
    id: string;
    description: string;
}
