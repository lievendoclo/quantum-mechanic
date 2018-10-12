import {PluginManager} from "./PluginManager";

export function Extensible(command: string) {
    return (target, key, descriptor) => {
        const originalMethod = descriptor.value;
        descriptor.value = async function() {
            const pluginManager: PluginManager = new PluginManager();
            await pluginManager.loadAvailablePlugins();
            await pluginManager.preHook(target, command);
            // console.log(`${target.constructor.name}:${key} is starting`);
            const result = originalMethod.apply(this, arguments);
            // console.log(`${command}:${key} is finished`);
            await pluginManager.postHook(target, command);
            return result;
        };
        return descriptor;
    };
}
