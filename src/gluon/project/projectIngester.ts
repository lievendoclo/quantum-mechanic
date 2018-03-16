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
