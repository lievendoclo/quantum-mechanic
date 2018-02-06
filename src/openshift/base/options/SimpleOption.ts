import {AbstractOption} from "./AbstractOption";

export class SimpleOption extends AbstractOption {
    constructor(name: string, ...args: string[]) {
        let value = "";
        args.forEach(arg => value = `${value} "${arg}"`);
        value = value.trim();
        super(name, value, false);
    }

    public build(): string {
        let optionString = `-${this.name}`;
        if (this.value.length > 0) {
            optionString = `${optionString} ${this.value}`;
        }
        return optionString;
    }

    public buildDisplayCommand() {
        return this.build();
    }
}
