export const TeamDevOpsDetails = {
    root_type: "TeamDevOpsDetails",
    types: [
        {
            kind: "OBJECT",
            name: "TeamDevOpsDetails",
            fields: [
                {
                    name: "teamId",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
                {
                    name: "devOpsEnvironment",
                    type: {
                        kind: "OBJECT",
                        name: "DevOpsEnvironmentDetails",
                    },
                },
                {
                    name: "buildCapabilities",
                    type: {
                        kind: "LIST",
                        ofType: {
                            kind: "SCALAR",
                            name: "String",
                        },
                    },
                },
            ],
        },
    ],
};
