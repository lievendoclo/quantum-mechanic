export class GenericOpenshiftResourceService {

    public async getAllPromotableResources(resources) {

        this.cleanDeploymentConfigs(resources);
        this.cleanImageStreams(resources);
        this.cleanRoutes(resources);
        this.cleanPVCs(resources);
        this.removeUnwantedResources(resources);

        return resources;
    }

    private cleanPVCs(allResources) {
        for (const resource of allResources.items) {
            if (resource.kind === "PersistentVolumeClaim") {
                delete resource.spec.volumeName;
                delete resource.metadata.annotations;
            }
        }
    }

    private cleanDeploymentConfigs(allResources) {
        for (const resource of allResources.items) {
            if (resource.kind === "DeploymentConfig") {
                resource.spec.replicas = 0;
            }
        }
    }

    private cleanImageStreams(allResources) {
        for (const resource of allResources.items) {
            if (resource.kind === "ImageStream") {
                resource.spec.tags = [];
            }
        }
    }

    private cleanRoutes(allResources) {
        for (const resource of allResources.items) {
            if (resource.kind === "Route") {
                delete resource.spec.host;
                resource.status = {};
            }
        }
    }

    private removeUnwantedResources(allResources) {
        for (let i = allResources.items.length - 1; i >= 0; i--) {
            const resource = allResources.items[i];
            if (resource.kind === "Pod" || resource.kind === "ReplicationController") {
                allResources.items.splice(i, 1);
            }
        }
    }
}
