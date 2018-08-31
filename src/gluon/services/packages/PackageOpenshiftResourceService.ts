import {logger} from "@atomist/automation-client";
import _ = require("lodash");
import {OpenshiftProjectEnvironment} from "../../../config/OpenShiftConfig";
import {QMConfig} from "../../../config/QMConfig";
import {QMError} from "../../util/shared/Error";
import {OCService} from "../openshift/OCService";

export class PackageOpenshiftResourceService {

    constructor(public ocService = new OCService()) {

    }

    public async getAllApplicationRelatedResources(applicationName, resources) {

        const applicationDC = this.findApplicationDeploymentConfig(applicationName, resources);

        const pvcs = this.findPVCs(applicationDC, resources);

        const secrets = this.findSecrets(applicationDC, resources);

        const configMaps = this.findConfigMaps(applicationDC, resources);

        const imageStreams = this.findImageStreams(applicationDC, resources);

        const services = this.findServices(applicationDC, resources);

        const routes = this.findRoutes(resources, services);

        resources.items = [];

        resources.items.push(applicationDC);
        resources.items.push(...pvcs);
        resources.items.push(...secrets);
        resources.items.push(...configMaps);
        resources.items.push(...imageStreams);
        resources.items.push(...services);
        resources.items.push(...routes);

        return resources;
    }

    public getPreProdEnvironment(): OpenshiftProjectEnvironment {
        const nEnvironments = QMConfig.subatomic.openshiftNonProd.defaultEnvironments.length;
        return QMConfig.subatomic.openshiftNonProd.defaultEnvironments[nEnvironments - 1];
    }

    public getDisplayMessage(allResources) {
        let text = "Found the following resources:\n";
        for (const resource of allResources.items) {
            text += `\t*${resource.kind}:* ${resource.metadata.name}\n`;
        }
        return text;
    }

    private findApplicationDeploymentConfig(applicationName: string, openshiftResources) {
        const kebabbedName = _.kebabCase(applicationName);

        for (const resource of openshiftResources.items) {
            if (resource.kind === "DeploymentConfig" && resource.metadata.name === kebabbedName) {
                resource.spec.replicas = 0;
                return resource;
            }
        }

        throw new QMError("Failed to find DeploymentConfig for selected application.");
    }

    private findPVCs(applicationDC, allResources) {
        const pvcs = [];
        try {
            const pvcNames = this.getPvcNames(applicationDC);
            for (const pvcName of pvcNames) {
                const pvc = this.findResourceByKindAndName(allResources, "PersistentVolumeClaim", pvcName);
                if (pvc !== null) {
                    pvcs.push(pvc);
                }
            }
        } catch (error) {
            logger.info("No PVC's found for application");
            logger.debug(error);
        }
        return pvcs;
    }

    private findSecrets(applicationDC, allResources) {
        const secrets = [];
        try {
            const secretNames = this.getSecretNames(applicationDC);
            for (const secretName of secretNames) {
                const secret = this.findResourceByKindAndName(allResources, "Secret", secretName);
                if (secret !== null) {
                    secrets.push(secret);
                }
            }
        } catch (error) {
            logger.info("No Secrets found for application");
            logger.debug(error);
        }
        return secrets;
    }

    private findConfigMaps(applicationDC, allResources) {
        const configMaps = [];
        try {
            const configMapNames = this.getConfigMapNames(applicationDC);
            for (const configMapName of configMapNames) {
                const configMap = this.findResourceByKindAndName(allResources, "ConfigMap", configMapName);
                if (configMap !== null) {
                    configMaps.push(configMap);
                }
            }
        } catch (error) {
            logger.info("No ConfigMaps found for application");
            logger.debug(error);
        }
        return configMaps;
    }

    private findResourceByKindAndName(allResources, kind: string, name: string) {
        logger.info("Trying to find: " + name);

        for (const resource of allResources.items) {
            logger.info("Kind: " + resource.kind);
            logger.info("Name: " + resource.metadata.name);
            if (resource.kind === kind && resource.metadata.name === name) {
                return resource;
            }
        }
        return null;
    }

    private getPvcNames(applicationDC) {
        const pvcNames = [];
        for (const volume of applicationDC.spec.template.spec.volumes) {
            if (!volume.persistentVolumeClaim === undefined) {
                pvcNames.push(volume.persistentVolumeClaim.claimName);
            }
        }
        return pvcNames;
    }

    private getSecretNames(applicationDC) {
        const pvcNames = [];
        for (const volume of applicationDC.spec.template.spec.volumes) {
            if (!volume.secret === undefined) {
                pvcNames.push(volume.secret.secretName);
            }
        }
        return pvcNames;
    }

    private getConfigMapNames(applicationDC) {
        const pvcNames = [];
        for (const volume of applicationDC.spec.template.spec.volumes) {
            if (!volume.configMap === undefined) {
                pvcNames.push(volume.configMap.name);
            }
        }
        return pvcNames;
    }

    private findImageStreams(applicationDC, allResources) {
        const imageStreams = [];
        try {
            const imageNameParts = applicationDC.spec.template.spec.containers[0].image.split("/");
            const imageStreamName = imageNameParts[imageNameParts.length - 1].split(":")[0].split("@")[0];
            const imageStream = this.findResourceByKindAndName(allResources, "ImageStream", imageStreamName);
            if (imageStream !== null) {
                imageStream.spec.tags = [];
                imageStreams.push(imageStream);
            }
        } catch (error) {
            logger.info("Unable to find image stream for DC");
            logger.debug(error);
        }
        return imageStreams;
    }

    private findServices(applicationDc, allResources) {
        const services = [];
        try {
            for (const resource of allResources.items) {
                if (resource.kind === "Service") {
                    try {
                        if (resource.spec.selector.name === applicationDc.metadata.name) {

                            services.push(resource);
                        }
                    } catch (error) {
                        // do nothing
                    }
                }
            }
        } catch (error) {
            logger.info("Unable to find services for DC");
            logger.debug(error);
        }
        return services;
    }

    private findRoutes(allResources, services) {
        const routes = [];
        try {
            for (const resource of allResources.items) {
                if (resource.kind === "Route") {
                    for (const service of services) {
                        if (resource.spec.to.name === service.metadata.name) {
                            delete resource.spec.host;
                            resource.status = {};
                            routes.push(resource);
                            break;
                        }
                    }
                }
            }
        } catch (error) {
            logger.info("Unable to find routes for DC");
            logger.debug(error);
        }
        return routes;
    }
}
