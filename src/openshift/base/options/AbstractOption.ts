import {CommandLineElement} from "../CommandLineElement";

export abstract class AbstractOption implements CommandLineElement {

    constructor(protected name: string, protected value: string, protected isSecret: boolean) {}

    public abstract build(): string;
    public abstract buildDisplayCommand(): string;
}
