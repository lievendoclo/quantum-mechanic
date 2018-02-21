import {BitbucketConfig} from "./BitbucketConfig";
import {DocsConfig} from "./DocsConfig";
import {GluonConfig} from "./GluonConfig";

export interface SubatomicConfig {
    bitbucket: BitbucketConfig;
    commandPrefix: string;
    docs: DocsConfig;
    gluon: GluonConfig;
    openshiftHost: string;
}
