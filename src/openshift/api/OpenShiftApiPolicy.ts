import {logger} from "@atomist/automation-client";
import {AxiosResponse} from "axios-https-proxy-fix";
import {AwaitAxios} from "../../http/AwaitAxios";
import {OpenShiftApiElement} from "./base/OpenShiftApiElement";
import {OpenshiftApiResult} from "./base/OpenshiftApiResult";
import {OpenshiftResource} from "./resources/OpenshiftResource";
import {ResourceFactory} from "./resources/ResourceFactory";
import {ResourceUrl} from "./resources/ResourceUrl";

export class OpenShiftApiPolicy extends OpenShiftApiElement {

    public async addRoleToUsers(usernames: string[], role: string, namespace: string) {

        const roleBindingResourceObject = await this.getRoleBindingResource(role, namespace);
        const openshiftRole = roleBindingResourceObject.roleBinding;
        openshiftRole.userNames = [];

        usernames.forEach( username => {
            if (username.startsWith("system:serviceaccount")) {

                const usernameSplit = username.split(":");
                username = usernameSplit.pop();
                const sourceNamespace = usernameSplit.pop();

                const subjectObj = {
                    kind: "ServiceAccount",
                    namespace: sourceNamespace,
                    name: username,
                };

                if (!openshiftRole.subjects.includes(subjectObj)) {
                    openshiftRole.subjects.push(subjectObj);
                    openshiftRole.userNames.push(`system:serviceaccount:${sourceNamespace}:${username}`);
                }
            } else {

                const subjectObj = {
                    kind: "User",
                    name: username,
                };

                if (!openshiftRole.subjects.includes(subjectObj)) {
                    openshiftRole.subjects.push(subjectObj);
                    openshiftRole.userNames.push(username);
                }
            }
        });

        return await this.addRoleToAccount(openshiftRole, role, namespace, roleBindingResourceObject.aNewRole );
    }

    public async addRoleToAccount(openshiftRole: OpenshiftResource, role: string, namespace: string, newRole: boolean) {
        //  If this is a new role then post else do a put
        if (newRole) {
            logger.debug("Role not found. Creating new role binding via post...");
            return await this.getAxiosInstanceOApi().post(ResourceUrl.getResourceKindUrl(
                ResourceFactory.baseResource("RoleBinding"), namespace), openshiftRole);
        } else {
            logger.debug("Found role. Adding user to role binding list via put...");
            return await this.getAxiosInstanceOApi().put(`${ResourceUrl.getResourceKindUrl(
                ResourceFactory.baseResource("RoleBinding"), namespace)}/${role}`, openshiftRole);
        }
    }

    public async getRoleBindingResource(role: string, destinationNamespace) {
        let newRole = false;
        let openshiftRole = await this.findExistingRole(this.getAxiosInstanceOApi(), role, destinationNamespace);
        if (openshiftRole === null) {
            newRole = true;
            openshiftRole = ResourceFactory.baseRoleBindingResource(destinationNamespace, role);
            logger.debug("Role not found. Creating new role binding");
        } else {
            logger.debug("Role found OK");
        }
        return { roleBinding: openshiftRole, aNewRole: newRole };
    }

    public removeRoleFromUser(username: string, role: string, namespace: string): Promise<OpenshiftApiResult> {
        if (!username.startsWith("system:serviceaccount")) {
            return this.removeRoleFromUserAccount(username, role, namespace);
        }
    }

    public removeRoleFromUserAccount(username: string, role: string, namespace: string): Promise<OpenshiftApiResult> {

        const instance = this.getAxiosInstanceOApi();

        return this.findExistingRole(instance, role, namespace).then(roleToEdit => {
            if (roleToEdit === null) {
                logger.info("Role not found. Nothing to do");
            } else {
                // Filter by all that are NOT the user to be removed
                roleToEdit.subjects = roleToEdit.subjects.filter(subject => subject.name !== username);
                roleToEdit.userName = roleToEdit.userNames.filter(userName => userName !== username);
                roleToEdit.userNames = roleToEdit.userNames.filter(userNames => userNames !== username);

                const url  = `${ResourceUrl.getResourceKindUrl(ResourceFactory.baseResource("RoleBinding"), namespace)}/${role}`;
                return instance.put(url, roleToEdit);
            }
        });
    }

    private findExistingRole(axios: AwaitAxios, role: string, namespace: string): Promise<OpenshiftResource> {
        return axios.get(`namespaces/${namespace}/rolebindings`).then(response => {
            logger.debug(JSON.stringify(response.status));
            logger.debug(JSON.stringify(response.data));
            let openshiftResource: OpenshiftResource = null;
            for (const item of response.data.items) {
                if (item.metadata.name === role.toLowerCase() && item.metadata.namespace === namespace.toLowerCase()) {
                    openshiftResource = ResourceFactory.convertToOpenshiftResource(item, "RoleBinding");
                    break;
                }
            }
            return openshiftResource;
        });

    }
}
