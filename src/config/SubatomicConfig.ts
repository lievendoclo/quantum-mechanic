import {BitbucketConfig} from "./BitbucketConfig";
import {DocsConfig} from "./DocsConfig";
import {GluonConfig} from "./GluonConfig";
import {OpenShiftConfig} from "./OpenShiftConfig";

export interface SubatomicConfig {
    bitbucket: BitbucketConfig;
    commandPrefix: string;
    docs: DocsConfig;
    gluon: GluonConfig;
    openshift: OpenShiftConfig;
}
