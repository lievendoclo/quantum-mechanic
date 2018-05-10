import {
    GraphClient, MutationOptions, QueryOptions,
} from "@atomist/automation-client/spi/graph/GraphClient";

export class TestGraphClient implements GraphClient {

    public endpoint: string;
    public path: string;
    public mutation: string;
    public queryString: string;
    public var: any;

    public executeQueryFromFile<T, Q>(path: string, variables?: Q, options?: any, current?: string): Promise<any> {
        this.path = path;
        const json = {
            ChatId: [
                {
                    userId: "U967SDE6",
                    screenName: "Test.User", // `${variables.userId}`, // ignore error, it does exist
                },
            ],
        };
        return Promise.resolve(json);
    }

    public executeMutationFromFile<T, Q>(path: string, variables?: Q, options?: any, current?: string): Promise<any> {
        this.path = path;
        return Promise.resolve();
    }

    public query<T, Q>(options: QueryOptions<Q> | string): Promise<T> {
        if (typeof options === "string") {
            options = {
                name: options,
            };
        }
        return this.executeQuery<T, Q>(options.name);
    }

    public mutate<T, Q>(options: MutationOptions<Q> | string): Promise<T> {
        if (typeof options === "string") {
            options = {
                name: options,
            };
        }
        return this.executeMutation<T, Q>(options.name);
    }

    public executeQuery<T, Q>(query: string, variables?: Q, options?: any): Promise<any> {
        this.queryString = query;
        return Promise.resolve();
    }

    public executeMutation<T, Q>(mutation: string, variables?: Q, options?: any): Promise<any> {
        this.mutation = mutation;
        return Promise.resolve();
    }
}
