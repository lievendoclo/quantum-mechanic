export function Extensible(command: string) {
    return (target, key, descriptor) => {
        const originalMethod = descriptor.value;
        descriptor.value = function() {
            console.log(`${target.constructor.name}:${key} is starting`);
            const result = originalMethod.apply(this, arguments);
            console.log(`${command}:${key} is finished`);
            return result;
        };
        return descriptor;
    };
}
