import _ = require("lodash");
import * as assert from "power-assert";
import {ImmutabilityPreserver} from "../../../../src/openshift/api/common/ImmutabilityPreserver";
import {OpenshiftResource} from "../../../../src/openshift/api/resources/OpenshiftResource";

describe("Openshift Api Common ImmutabilityPreserver test", () => {

    it("should preserve clusterIP in new resource with spec property without modifying existing properties", () => {

        const immutabilityPreserver = new ImmutabilityPreserver();

        const newResource: OpenshiftResource = {
            apiVersion: "v1",
            kind: "Service",
            metadata: {},
            spec: {
                someRandomProperty: "1",
            },
        };

        const oldResource: OpenshiftResource = {
            apiVersion: "v1",
            kind: "Service",
            metadata: {},
            spec: {
                clusterIP: "1.1.1.1",
            },
        };

        immutabilityPreserver.preserveImmutability(newResource, oldResource);

        assert.equal(newResource.spec.clusterIP, "1.1.1.1");
        assert.equal(newResource.spec.someRandomProperty, "1");
    });

    it("should preserve clusterIP in new resource without spec property without modifying existing properties", () => {
        const immutabilityPreserver = new ImmutabilityPreserver();

        const newResource: OpenshiftResource = {
            apiVersion: "v1",
            kind: "Service",
            metadata: {},
            something: {
                someRandomProperty: "1",
            },
        };

        const oldResource: OpenshiftResource = {
            apiVersion: "v1",
            kind: "Service",
            metadata: {},
            spec: {
                clusterIP: "1.1.1.1",
            },
        };

        immutabilityPreserver.preserveImmutability(newResource, oldResource);

        assert.equal(newResource.spec.clusterIP, "1.1.1.1");
        assert.equal(newResource.something.someRandomProperty, "1");
    });

    it("should preserve uid and resourceVersion in new resource without spec property without modifying existing properties", () => {
        const immutabilityPreserver = new ImmutabilityPreserver();

        const newResource: OpenshiftResource = {
            apiVersion: "v1",
            kind: "Service",
            metadata: {
                label: "1",
            },
            something: {
                someRandomProperty: "1",
            },
        };

        const oldResource: OpenshiftResource = {
            apiVersion: "v1",
            kind: "Service",
            metadata: {
                uid: "1",
                resourceVersion: "799",
            },
        };

        immutabilityPreserver.preserveImmutability(newResource, oldResource);

        assert.equal(newResource.metadata.uid, "1");
        assert.equal(newResource.metadata.resourceVersion, "799");
        assert.equal(newResource.something.someRandomProperty, "1");
        assert.equal(newResource.metadata.label, "1");
    });

    it("should not modify the new resource if there are no immutable properties", () => {
        const immutabilityPreserver = new ImmutabilityPreserver();

        const newResource: OpenshiftResource = {
            apiVersion: "v1",
            kind: "Service",
            metadata: {
                label: "1",
            },
            something: {
                someRandomProperty: "1",
            },
        };

        const newResourceClone = _.cloneDeep(newResource);

        const oldResource: OpenshiftResource = {
            apiVersion: "v1",
            kind: "Service",
            metadata: {
                label: "2",
            },
        };

        immutabilityPreserver.preserveImmutability(newResource, oldResource);

        assert.deepEqual(newResource, newResourceClone);
    });
});
