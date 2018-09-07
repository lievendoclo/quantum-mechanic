import {OpenshiftProjectEnvironment} from "../../../config/OpenShiftConfig";
import {QMConfig} from "../../../config/QMConfig";

export function getHighestPreProdEnvironment(): OpenshiftProjectEnvironment {
    const nEnvironments = QMConfig.subatomic.openshiftNonProd.defaultEnvironments.length;
    return QMConfig.subatomic.openshiftNonProd.defaultEnvironments[nEnvironments - 1];
}

export function getResourceDisplayMessage(allResources) {
    let text = "Found the following resources:\n";
    for (const resource of allResources.items) {
        text += `\t*${resource.kind}:* ${resource.metadata.name}\n`;
    }
    return text;
}
