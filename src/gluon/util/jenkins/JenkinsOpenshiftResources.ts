export function serviceAccountDefinition() {
    return {
        apiVersion: "v1",
        kind: "ServiceAccount",
        metadata: {
            annotations: {
                "subatomic.bison.co.za/managed": "true",
                "serviceaccounts.openshift.io/oauth-redirectreference.jenkins": '{"kind":"OAuthRedirectReference", "apiVersion":"v1","reference":{"kind":"Route","name":"jenkins"}}',
            },
            name: "subatomic-jenkins",
        },
    };
}

export function roleBindingDefinition() {
    return {
        apiVersion: "v1",
        kind: "RoleBinding",
        metadata: {
            annotations: {
                "subatomic.bison.co.za/managed": "true",
            },
            name: "subatomic-jenkins-edit",
        },
        roleRef: {
            apiGroup: "v1",
            kind: "ClusterRole",
            name: "admin",
        },
        subjects: [{
            kind: "ServiceAccount",
            name: "subatomic-jenkins",
        }],
    };
}
