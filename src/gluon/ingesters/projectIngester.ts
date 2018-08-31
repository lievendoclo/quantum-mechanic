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
                        name: "GluonTeam",
                    },
                },
                {
                    name: "tenant",
                    type: {
                        kind: "OBJECT",
                        name: "GluonTenant",
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
                            name: "GluonTeam",
                        },
                    },
                },
                {
                    name: "owningTenant",
                    type: {
                        kind: "OBJECT",
                        name: "GluonTenant",
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
    ],
};

export const ProjectProductionEnvironmentsRequestedEvent: Ingester = {
    root_type: "ProjectProductionEnvironmentsRequestedEvent",
    types: [
        {
            kind: "OBJECT",
            name: "ProjectProductionEnvironmentsRequestedEvent",
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
                            name: "GluonTeam",
                        },
                    },
                },
                {
                    name: "owningTenant",
                    type: {
                        kind: "OBJECT",
                        name: "GluonTenant",
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
    ],
};

export const TeamsLinkedToProjectEvent: Ingester = {
    root_type: "TeamsLinkedToProjectEvent",
    types: [
        {
            kind: "OBJECT",
            name: "TeamsLinkedToProjectEvent",
            fields: [
                {
                    name: "team",
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
    ],
};
