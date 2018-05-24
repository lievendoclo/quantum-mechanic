import {QMConfig} from "../../config/QMConfig";
import {SimpleOption} from "../../openshift/base/options/SimpleOption";
import {OCClient} from "../../openshift/OCClient";
import {OCCommon} from "../../openshift/OCCommon";

export function subatomicAppOpenshiftTemplates(namespace: string): Promise<any> {
    return OCClient.login(QMConfig.subatomic.openshift.masterUrl, QMConfig.subatomic.openshift.auth.token)
        .then(
            () => {
                return OCCommon.commonCommand("get", "templates",
                    [],
                    [
                        new SimpleOption("l", "usage=subatomic-app"),
                        new SimpleOption("-namespace", namespace),
                        new SimpleOption("-output", "json"),
                    ],
                );
            })
        .then(templatesOutput => {
            const templates: any = JSON.parse(templatesOutput.output).items;
            return Promise.resolve(templates);
        });
}
