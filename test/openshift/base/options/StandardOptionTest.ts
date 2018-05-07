import * as assert from "power-assert";
import {StandardOption} from "../../../../src/openshift/base/options/StandardOption";

describe("Openshift StandardOption Test", () => {

    it("create an option formatted correctly", () => {
        const standardOption = new StandardOption("file");
        assert(standardOption.build() === "--file");
    });

    it("create an option formatted incorrectly", () => {
        const standardOption = new StandardOption("file", "value");
        assert(standardOption.build() === `--file="value"`);
    });
});
