import * as assert from "power-assert";
import {SimpleOption} from "../../../../src/openshift/base/options/SimpleOption";

describe("Openshift SimpleOption Test", () => {

    it("create an option formatted correctly", () => {
        const simpleOption = new SimpleOption("file");
        assert(simpleOption.build() === "-file");
    });

    it("create a build display", () => {
        const simpleOption = new SimpleOption("file", "value");
        assert(simpleOption.buildDisplayCommand() === "-file \"value\"");
    });
});
