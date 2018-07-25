export class QuotaLoader {

    private readonly QUOTA_DIRECTORY = "/resources/quotas/";

    public getDevOpsDefaultResourceQuota() {
        return this.readQuotaFileContents("devops-default-resource-quota.json");
    }

    public getDevOpsDefaultLimitRange() {
        return this.readQuotaFileContents("devops-default-limit-range.json");
    }

    public getProjectDefaultResourceQuota() {
        return this.readQuotaFileContents("project-default-resource-quota.json");
    }

    public getProjectDefaultLimitRange() {
        return this.readQuotaFileContents("project-default-limit-range.json");
    }

    private readQuotaFileContents(fileName: string): string {
        const fs = require("fs");
        const buffer = fs.readFileSync(`${this.QUOTA_DIRECTORY}${fileName}`);
        return buffer.toString();
    }
}
