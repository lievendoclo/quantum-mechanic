import {logger} from "@atomist/automation-client";
import _ = require("lodash");
import {inspect} from "util";
import {isSuccessCode} from "../../../http/Http";
import {OpenShiftApi} from "../../../openshift/api/OpenShiftApi";
import {OpenshiftResource} from "../../../openshift/api/resources/OpenshiftResource";
import {OCCommandResult} from "../../../openshift/base/OCCommandResult";
import {OCCommon} from "../../../openshift/OCCommon";
import {QMError} from "../../util/shared/Error";

export class OCImageService {

    get openShiftApi(): OpenShiftApi {
        if (this.openShiftApiInstance === undefined) {
            logger.error(`Failed to access the openShiftApiInstance. Make sure the you have performed an OCService.login command`);
            throw new QMError("OpenShift login failure!");
        }
        return this.openShiftApiInstance;
    }

    set openShiftApi(value: OpenShiftApi) {
        this.openShiftApiInstance = value;
    }

    private openShiftApiInstance: OpenShiftApi;

    public async getSubatomicImageStreamTags(namespace = "subatomic", cleanNamespace = true): Promise<OpenshiftResource[]> {
        logger.debug(`Trying to get subatomic image stream. namespace: ${namespace}`);
        const queryResult = await this.openShiftApi.get.getAllFromNamespace("ImageStreamTag", namespace, "image.openshift.io/v1");

        if (isSuccessCode(queryResult.status)) {
            const isTags = [];
            for (const imageStreamTag of queryResult.data.items) {
                if (imageStreamTag.metadata.labels !== undefined) {
                    if (imageStreamTag.metadata.labels.usage === "subatomic-is") {
                        imageStreamTag.kind = "ImageStreamTag";
                        if (cleanNamespace) {
                            delete imageStreamTag.metadata.namespace;
                        }
                        isTags.push(imageStreamTag);
                    }
                }
            }
            logger.info(JSON.stringify(isTags, undefined, 2));
            return isTags;
        } else {
            logger.error(`Failed to find Subatomic App Templates in Subatomic namespace: ${inspect(queryResult)}`);
            throw new QMError("Failed to find Subatomic App Templates in the Subatomic namespace");
        }
    }

    public modifyImageStreamTagsToImportIntoNamespace(imageStreamTagList: OpenshiftResource[], namespace: string): OpenshiftResource[] {
        const imageStreamTags = _.cloneDeep(imageStreamTagList);
        for (const imageStreamTag of imageStreamTags) {
            const dockerImageReference: string[] = imageStreamTag.image.dockerImageReference.split("/");
            const originalNamespace = dockerImageReference[1];
            const imageName = dockerImageReference[2];
            imageStreamTag.lookupPolicy = {
                local: false,
            };
            imageStreamTag.referencePolicy = {
                type: "Source",
            };
            imageStreamTag.metadata = {
                namespace,
                name: imageStreamTag.metadata.name,
                creationTimestamp: null,
            };
            imageStreamTag.tag = {
                name: "",
                annotations: null,
                from: {
                    kind: "ImageStreamImage",
                    namespace: originalNamespace,
                    name: imageName,
                },
                generation: null,
                importPolicy: {},
                referencePolicy: {
                    type: "Source",
                },
            };
            imageStreamTag.apiVersion = "image.openshift.io/v1";
        }
        return imageStreamTags;
    }

    public async tagImageToNamespace(sourceNamespace: string, sourceImageStreamTagName: string, destinationProjectNamespace: string, destinationImageStreamTagName: string = sourceImageStreamTagName): Promise<OCCommandResult> {
        logger.debug(`Trying tag image to namespace. sourceNamespace: ${sourceNamespace}; imageStreamTagName: ${sourceImageStreamTagName}; destinationProjectNamespace: ${destinationProjectNamespace}; destinationImageStreamTagName: ${destinationImageStreamTagName}`);
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
