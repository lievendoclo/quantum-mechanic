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
                            name: "GluonTeam",
                        },
                    },
                },
                {
                    name: "createdBy",
                    type: {
                        kind: "OBJECT",
                        name: "ActionedBy",
                    },
                },
            ],
        },
    ],
};
