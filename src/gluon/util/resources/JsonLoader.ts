import {QMTemplate} from "../../../template/QMTemplate";

export class JsonLoader {
    protected readFileContents(filePath: string): string {
        const fs = require("fs");
        const buffer = fs.readFileSync(filePath);
        return JSON.parse(buffer.toString());
    }

    protected readTemplatizedFileContents(filePath: string, parameters: { [k: string]: any }) {
        const template = new QMTemplate(filePath);
        return JSON.parse(template.build(parameters));
    }
}
