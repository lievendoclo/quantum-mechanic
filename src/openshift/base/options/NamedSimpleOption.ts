import {SimpleOption} from "./SimpleOption";

export class NamedSimpleOption extends SimpleOption {

    public build(): string {
        let optionString = `-${this.name}`;
        if (this.value.length > 0) {
            optionString = `${optionString}=${this.value}`;
        }
        return optionString;
    }
}
