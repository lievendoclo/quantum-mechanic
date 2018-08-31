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
    ],
};

export const PackageConfiguredEvent: Ingester = {
    root_type: "PackageConfiguredEvent",
    types: [
        {
            kind: "OBJECT",
            name: "PackageConfiguredEvent",
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
                    name: "buildDetails",
                    type: {
                        kind: "OBJECT",
                        name: "BuildDetails",
                    },
                },
            ],
        },
        {
            kind: "OBJECT",
            name: "BuildDetails",
            fields: [
                {
                    name: "buildType",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "jenkinsDetails",
                    type: {
                        kind: "OBJECT",
                        name: "JenkinsDetails",
                    },
                },
            ],
        },
        {
            kind: "OBJECT",
            name: "JenkinsDetails",
            fields: [
                {
                    name: "jenkinsFile",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
            ],
        },
    ],
};
