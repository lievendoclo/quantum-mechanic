import {GraphClient, MutationOptions, QueryOptions} from "@atomist/automation-client/spi/graph/GraphClient";
import _ = require("lodash");

export class TestGraphClient implements GraphClient {

    public endpoint: string;
    public path: string;
    public mutation: string;
    public queryString: string;
    public var: any;

    public executeQueryFromFileResults: Array<{ result: boolean, returnValue?: any }> = [];
    public executeMutationFromFileResults: Array<{ result: boolean, returnValue?: any }> = [];
    public executeQueryResults: Array<{ result: boolean, returnValue?: any }> = [];
    public executeMutationResults: Array<{ result: boolean, returnValue?: any }> = [];

    public defaultReturn = {
        ChatId: [
            {
                userId: "U967SDE6",
                screenName: "Test.User", // `${variables.userId}`, // ignore error, it does exist
            },
        ],
    };

    public executeQueryFromFile<T, Q>(path: string, variables?: Q, options?: any, current?: string): Promise<any> {
        this.path = path;
        if (this.executeQueryFromFileResults.length > 0) {
            const result = this.executeQueryFromFileResults.shift();
            return this.returnPredefinedResult(result);
        }
        return Promise.resolve(this.defaultReturn);
    }

    public executeMutationFromFile<T, Q>(path: string, variables?: Q, options?: any, current?: string): Promise<any> {
        this.path = path;
        if (this.executeMutationFromFileResults.length > 0) {
            const result = this.executeMutationFromFileResults.shift();
            return this.returnPredefinedResult(result);
        }
        return Promise.resolve(this.defaultReturn);
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
        if (this.executeQueryResults.length > 0) {
            const result = this.executeQueryResults.shift();
            return this.returnPredefinedResult(result);
        }
        return Promise.resolve(this.defaultReturn);
    }

    public executeMutation<T, Q>(mutation: string, variables?: Q, options?: any): Promise<any> {
        this.mutation = mutation;
        if (this.executeMutationResults.length > 0) {
            const result = this.executeMutationResults.shift();
            return this.returnPredefinedResult(result);
        }
        return Promise.resolve(this.defaultReturn);
    }

    private returnPredefinedResult(predefinedResult: { result: boolean, returnValue?: any }) {
        const returnValue = _.isEmpty(predefinedResult.returnValue) ? this.defaultReturn : predefinedResult.returnValue;
        if (predefinedResult.result) {
            return Promise.resolve(returnValue);
        } else {
            return Promise.reject(returnValue);
        }
    }
}
