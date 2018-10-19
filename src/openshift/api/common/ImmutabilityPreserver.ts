import _ = require("lodash");
import {OpenshiftResource} from "../resources/OpenshiftResource";

export class ImmutabilityPreserver {

    private static immutableProperties: { [key: string]: string[] };

    constructor() {
        if (_.isEmpty(ImmutabilityPreserver.immutableProperties)) {
            ImmutabilityPreserver.immutableProperties = {
                service: [
                    "spec.clusterIP",
                ],
            };
        }
    }

    public preserveImmutability(newResource: OpenshiftResource, oldResource: OpenshiftResource) {
        if (oldResource.metadata.uid !== undefined) {
            newResource.metadata.uid = oldResource.metadata.uid;
        }
        if (oldResource.metadata.resourceVersion !== undefined) {
            newResource.metadata.resourceVersion = oldResource.metadata.resourceVersion;
        }

        if (ImmutabilityPreserver.immutableProperties.hasOwnProperty(newResource.kind.toLowerCase())) {
            for (const immutableProperty of ImmutabilityPreserver.immutableProperties[newResource.kind.toLowerCase()]) {
                const propertyValue = this.getPropertyValue(oldResource, immutableProperty.split("."));
                if (propertyValue !== undefined) {
                    this.setPropertyValue(newResource, immutableProperty.split("."), propertyValue);
                }
            }
        }
    }

    private getPropertyValue(baseObject: any, propertyReference: string[]) {
        if (propertyReference.length === 0) {
            return baseObject;
        }
        if (baseObject.hasOwnProperty(propertyReference[0])) {
            return this.getPropertyValue(baseObject[propertyReference[0]], propertyReference.slice(1));
        } else {
            return undefined;
        }
    }

    private setPropertyValue(baseObject: any, propertyReference: string[], value: any) {
        if (propertyReference.length === 1) {
            baseObject[propertyReference[0]] = value;
            return;
        }
        if (baseObject.hasOwnProperty(propertyReference[0])) {
            return this.setPropertyValue(baseObject[propertyReference[0]], propertyReference.slice(1), value);
        } else {
            baseObject[propertyReference[0]] = this.createProperty(propertyReference.slice(1), value);
            return;
        }
    }

    private createProperty(propertyReferenceOriginal: string[], value: any) {
        const propertyReference = _.clone(propertyReferenceOriginal);
        const propertyName = propertyReference.pop();
        const newValue: { [key: string]: any } = {};
        newValue[propertyName] = value;
        if (propertyReference.length === 0) {
            return newValue;
        } else {
            return this.createProperty(propertyReference, value);
        }
    }
}
