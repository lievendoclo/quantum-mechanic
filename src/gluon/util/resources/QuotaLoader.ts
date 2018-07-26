import {JsonLoader} from "./JsonLoader";

export class QuotaLoader extends JsonLoader {

    private readonly QUOTA_DIRECTORY = "resources/quotas/";

    public getDevOpsDefaultResourceQuota() {
        return this.readFileContents(`${this.QUOTA_DIRECTORY}devops-default-resource-quota.json`);
    }

    public getDevOpsDefaultLimitRange() {
        return this.readFileContents(`${this.QUOTA_DIRECTORY}devops-default-limit-range.json`);
    }

    public getProjectDefaultResourceQuota() {
        return this.readFileContents(`${this.QUOTA_DIRECTORY}project-default-resource-quota.json`);
    }

    public getProjectDefaultLimitRange() {
        return this.readFileContents(`${this.QUOTA_DIRECTORY}project-default-limit-range.json`);
    }

}
