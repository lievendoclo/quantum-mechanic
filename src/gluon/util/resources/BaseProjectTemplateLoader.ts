import {JsonLoader} from "./JsonLoader";

export class BaseProjectTemplateLoader extends JsonLoader {

    private readonly PROJECT_TEMPLATE_DIR = "resources/templates/openshift/project/";

    public getTemplate(parameters: { [k: string]: any } = {}) {
        return this.readTemplatizedFileContents(`${this.PROJECT_TEMPLATE_DIR}base-project-template.json`, parameters);
    }
}
