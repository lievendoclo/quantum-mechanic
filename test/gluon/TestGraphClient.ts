import {
    GraphClient,
} from "@atomist/automation-client/spi/graph/GraphClient";

export class TestGraphClient implements GraphClient {
    public endpoint: string;
    public path: string;
    public query: string;
    public mutation: string;
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

    public executeQuery<T, Q>(query: string, variables?: Q, options?: any): Promise<any> {
        this.query = query;
        return Promise.resolve();
    }

    public executeMutationFromFile<T, Q>(path: string, variables?: Q, options?: any, current?: string): Promise<any> {
        this.path = path;
        return Promise.resolve();
    }

    public executeMutation<T, Q>(mutation: string, variables?: Q, options?: any): Promise<any> {
        this.mutation = mutation;
        return Promise.resolve();
    }

}
