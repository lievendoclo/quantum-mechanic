import {Ingester} from "@atomist/automation-client/ingesters";

export const BitbucketProjectRequestedEvent: Ingester = {
    root_type: "BitbucketProjectRequestedEvent",
    types: [
        {
            kind: "OBJECT",
            name: "BitbucketProjectRequestedEvent",
            fields: [
                {
                    name: "project",
                    type: {
                        kind: "OBJECT",
                        name: "Project",
                    },
                },
                {
                    name: "bitbucketProjectRequest",
                    type: {
                        kind: "OBJECT",
                        name: "BitbucketProjectRequest",
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
            name: "BitbucketProjectRequest",
            fields: [
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

export const BitbucketProjectAddedEvent: Ingester = {
    root_type: "BitbucketProjectAddedEvent",
    types: [
        {
            kind: "OBJECT",
            name: "BitbucketProjectAddedEvent",
            fields: [
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
                    name: "createdBy",
                    type: {
                        kind: "OBJECT",
                        name: "CreatedBy",
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
            name: "CreatedBy",
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
