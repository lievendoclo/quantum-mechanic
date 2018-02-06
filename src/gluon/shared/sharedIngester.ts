import {Ingester} from "@atomist/automation-client/ingesters";

export const SlackIdentity: Ingester = {
    root_type: "SlackIdentity",
    types: [
        {
            kind: "OBJECT",
            name: "SlackIdentity",
            fields: [
                {
                    name: "screenName",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "userId",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "teamChannel",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
            ],
        },
    ],
};

export const Team: Ingester = {
    root_type: "Team",
    types: [
        {
            kind: "OBJECT",
            name: "Team",
            fields: [
                {
                    name: "teamId",
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
                    name: "slackIdentity",
                    type: {
                        kind: "OBJECT",
                        name: "SlackIdentity",
                    },
                },
                {
                    name: "owners",
                    type: {
                        kind: "LIST",
                        ofType: {
                            kind: "OBJECT",
                            name: "Owner",
                        },
                    },
                },
                {
                    name: "members",
                    type: {
                        kind: "LIST",
                        ofType: {
                            kind: "OBJECT",
                            name: "Member",
                        },
                    },
                },
            ],
        },
        {
            kind: "OBJECT",
            name: "Owner",
            fields: [
                {
                    name: "firstName",
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
        {
            kind: "OBJECT",
            name: "Member",
            fields: [
                {
                    name: "firstName",
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
