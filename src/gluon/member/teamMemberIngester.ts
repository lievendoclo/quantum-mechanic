import {Ingester} from "@atomist/automation-client/ingesters";

export const TeamMemberCreatedEvent: Ingester = {
    root_type: "TeamMemberCreatedEvent",
    types: [
        {
            kind: "OBJECT",
            name: "TeamMemberCreatedEvent",
            fields: [
                {
                    name: "memberId",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                }, {
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
                    name: "domainCredentials",
                    type: {
                        kind: "OBJECT",
                        name: "DomainCredentials",
                    },
                },
            ],
        },
        {
            kind: "OBJECT",
            name: "DomainCredentials",
            fields: [
                {
                    name: "domain",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "username",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "password",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
            ],
        },
    ],
};
