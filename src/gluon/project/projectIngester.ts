import {Ingester} from "@atomist/automation-client/ingesters";

export const ProjectCreatedEvent: Ingester = {
    root_type: "ProjectCreatedEvent",
    types: [
        {
            kind: "OBJECT",
            name: "ProjectCreatedEvent",
            fields: [
                {
                    name: "project",
                    type: {
                        kind: "OBJECT",
                        name: "Project",
                    },
                },
                {
                    name: "team",
                    type: {
                        kind: "OBJECT",
                        name: "Team",
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

export const ProjectEnvironmentsRequestedEvent: Ingester = {
    root_type: "ProjectEnvironmentsRequestedEvent",
    types: [
        {
            kind: "OBJECT",
            name: "ProjectEnvironmentsRequestedEvent",
            fields: [
                {
                    name: "project",
                    type: {
                        kind: "OBJECT",
                        name: "Project",
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
