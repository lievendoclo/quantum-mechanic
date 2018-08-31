import {Ingester} from "@atomist/automation-client/ingesters";

export const ApplicationProdRequestedEvent: Ingester = {
    root_type: "ApplicationProdRequestedEvent",
    types: [
        {
            kind: "OBJECT",
            name: "ApplicationProdRequestedEvent",
            fields: [
                {
                    name: "applicationProdRequest",
                    type: {
                        kind: "OBJECT",
                        name: "ApplicationProdRequest",
                    },
                },
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
            ],
        },
        {
            kind: "OBJECT",
            name: "ApplicationProdRequest",
            fields: [
                {
                    name: "applicationProdRequestId",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
            ],
        },
    ],
};
