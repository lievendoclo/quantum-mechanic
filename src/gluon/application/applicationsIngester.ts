import {Ingester} from "@atomist/automation-client/ingesters";

export const ApplicationCreatedEvent: Ingester = {
    root_type: "ApplicationCreatedEvent",
    types: [
        {
            kind: "OBJECT",
            name: "ApplicationCreatedEvent",
            fields: [
                {
                    name: "application",
                    type: {
                        kind: "OBJECT",
                        name: "Application",
                    },
                },
                {
                    name: "project",
                    type: {
                        kind: "OBJECT",
                        name: "Project",
                    },
                },
                {
                    name: "bitbucketProject",
                    type: {
                        kind: "OBJECT",
                        name: "BitbucketProject",
                    },
                },
                {
                    name: "bitbucketRepository",
                    type: {
                        kind: "OBJECT",
                        name: "BitbucketRepository",
                    },
                },
                {
                    name: "teams",
                    type: {
                        kind: "LIST",
                        ofType: {
                            kind: "OBJECT",
                            name: "Team",
                        },
                    },
                },
                {
                    name: "requestedBy",
                    type: {
                        kind: "OBJECT",
                        name: "RequestedBy",
                    },
                },
            ],
        },
        {
            kind: "OBJECT",
            name: "Application",
            fields: [
                {
                    name: "applicationId",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "name",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "description",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
            ],
        },
        {
            kind: "OBJECT",
            name: "Project",
            fields: [
                {
                    name: "projectId",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "name",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "description",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
            ],
        },
        {
            kind: "OBJECT",
            name: "BitbucketProject",
            fields: [
                {
                    name: "id",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "key",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "name",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "description",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "url",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
            ],
        },
        {
            kind: "OBJECT",
            name: "BitbucketRepository",
            fields: [
                {
                    name: "id",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "name",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "repoUrl",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "remoteUrl",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
            ],
        },
        {
            kind: "OBJECT",
            name: "RequestedBy",
            fields: [
                {
                    name: "firstName",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "lastName",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "email",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "domainUsername",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "slackIdentity",
                    type: {
                        kind: "OBJECT",
                        name: "SlackIdentity",
                    },
                },
            ],
        },
    ],
};
