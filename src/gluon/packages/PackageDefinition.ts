export interface PackageDefinition {
    openshiftTemplate?: string;
    buildConfig: BuildConfig;
    jenkinsfile?: string;
}

export interface BuildConfig {
    imageStream: string;
    envVariables?: {[key: string]: string};
}
