import * as assert from "power-assert";
import {NamedSimpleOption} from "../../../../src/openshift/base/options/NamedSimpleOption";

describe("Openshift NamedSimpleOption Test", () => {

    it("create an option formatted correctly", () => {
        const namedSimpleOption = new NamedSimpleOption("file");
        assert(namedSimpleOption.build() === "-file");
    });
});
