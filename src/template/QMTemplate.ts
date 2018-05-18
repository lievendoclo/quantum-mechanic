import * as Handlebars from "handlebars";

export class QMTemplate {

    private readonly template: HandlebarsTemplateDelegate;

    constructor(templateFile: string, trimLines = false) {
        const fs = require("fs");
        const buffer = fs.readFileSync(templateFile);
        this.template = Handlebars.compile(buffer.toString());
    }

    public build(parameters: {[k: string]: string}) {
        const safeParameters: {[k: string]: any} = {};
        for (const key of Object.keys(parameters)) {
            safeParameters[key] = new Handlebars.SafeString(parameters[key]);
        }
        return this.template(safeParameters);
    }
}
