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
                        name: "GluonApplication",
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
                    name: "owningTeam",
                    type: {
                        kind: "OBJECT",
                        name: "GluonTeam",
                    },
                },
                {
                    name: "teams",
                    type: {
                        kind: "LIST",
                        ofType: {
                            kind: "OBJECT",
                            name: "GluonTeam",
                        },
                    },
                },
                {
                    name: "requestedBy",
                    type: {
                        kind: "OBJECT",
                        name: "ActionedBy",
                    },
                },
                {
                    name: "requestConfiguration",
                    type: {
                        kind: "SCALAR",
                        name: "Boolean",
                    },
                },
            ],
        },
        {
            kind: "OBJECT",
            name: "GluonApplication",
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
                {
                    name: "applicationType",
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
                    name: "bitbucketId",
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
    ],
};
