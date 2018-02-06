import {AbstractOption} from "./AbstractOption";

export class StandardOption extends AbstractOption {

    constructor(name: string, value: string = null, isSecret: boolean = false) {
        super(name, value, isSecret);
    }

    public build(): string {
        let optionString = `--${this.name}`;
        if (this.value != null) {
            optionString = `${optionString}="${this.value}"`;
        }
        return optionString;
    }

    public buildDisplayCommand(): string {
        let optionString = `--${this.name}`;
        if (this.value != null) {
            let displayValue = this.value;
            if (this.isSecret) {
                displayValue = "*secret*";
            }
            optionString = `${optionString}="${displayValue}"`;
        }
        return optionString;
    }
}
