import {logger} from "@atomist/automation-client";
import {BaseQMHandler} from "../shared/BaseQMHandler";
import {PluginManager} from "./PluginManager";

export function Extensible(pluginHandlerIdentifier: string) {
    return (target, key, descriptor) => {
        if (target instanceof BaseQMHandler) {
            const originalMethod = descriptor.value;
            descriptor.value = async function() {
                // Note that the "this" reference here is the owning class of the extended function
                const pluginManager: PluginManager = new PluginManager();
                await pluginManager.loadAvailablePlugins();
                try {
                    await pluginManager.preHook(this, pluginHandlerIdentifier);
                    const result = originalMethod.apply(this, arguments);
                    if (result instanceof Promise) {
                        // this allows for both async and non async functions to be extended
                        await result;
                    }
                    await pluginManager.postHook(this, pluginHandlerIdentifier);
                    return result;
                } catch (error) {
                    // uncaught errors should be caught and the command should be failed before running post hooks
                    this.failCommand();
                    await pluginManager.postHook(this, pluginHandlerIdentifier);
                    throw error;
                }
            };
        } else {
            logger.error(`Function marked as Extensible but class does not extend BaseQMHandler. Plugin support disabled for function: ${target.constructor.name}.${key}`);
        }
        return descriptor;
    };
}
