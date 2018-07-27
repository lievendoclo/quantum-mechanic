import {logger} from "@atomist/automation-client";
import {OCCommandResult} from "../../../openshift/base/OCCommandResult";
import {SimpleOption} from "../../../openshift/base/options/SimpleOption";
import {OCCommon} from "../../../openshift/OCCommon";

export class OCImageService {

    public async getSubatomicImageStreamTags(namespace = "subatomic"): Promise<OCCommandResult> {
        logger.debug(`Trying to get subatomic image stream. namespace: ${namespace}`);
        return OCCommon.commonCommand("get", "istag",
            [],
            [
                new SimpleOption("l", "usage=subatomic-is"),
                new SimpleOption("-namespace", namespace),
                new SimpleOption("-output", "json"),
            ],
        );
    }

    public async tagImageToNamespace(sourceNamespace: string, sourceImageStreamTagName: string, destinationProjectNamespace: string, destinationImageStreamTagName: string = sourceImageStreamTagName): Promise<OCCommandResult> {
        logger.debug(`Trying tag image to namespace. sourceNamespace: ${sourceNamespace}; imageStreamTagName: ${sourceImageStreamTagName}; destinationProjectNamespace: ${destinationProjectNamespace}; destingationImageStreamTagName: ${destinationImageStreamTagName}`);
        return await OCCommon.commonCommand("tag",
            `${sourceNamespace}/${sourceImageStreamTagName}`,
            [`${destinationProjectNamespace}/${destinationImageStreamTagName}`]);
    }

    public async tagAllImagesToNamespace(sourceNamespace: string, sourceImageStreamsTagNames: string[], destinationProjectNamespace: string) {
        for (const imageStreamTag of sourceImageStreamsTagNames) {
            await this.tagImageToNamespace(sourceNamespace, imageStreamTag, destinationProjectNamespace);
        }
    }

}
