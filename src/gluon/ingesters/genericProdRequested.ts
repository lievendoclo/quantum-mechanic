import {Ingester} from "@atomist/automation-client/ingesters";

export const GenericProdRequestedEvent: Ingester = {
    root_type: "GenericProdRequestedEvent",
    types: [
        {
            kind: "OBJECT",
            name: "GenericProdRequestedEvent",
            fields: [
                {
                    name: "genericProdRequestId",
                    type: {
                        kind: "SCALAR",
                        name: "String",
                    },
                },
            ],
        },
    ],
};
