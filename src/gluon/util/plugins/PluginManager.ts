import _ = require("lodash");
import {QMConfig} from "../../../config/QMConfig";
import {PluginResourceStore} from "./PluginResourceStore";

// TODO: We need error handling on badly formed plugins.
export class PluginManager {

    private static availablePlugins: { [key: string]: string[] };

    public async loadAvailablePlugins() {
        if (_.isEmpty(PluginManager.availablePlugins)) {
            PluginManager.availablePlugins = {};
            const {lstatSync, readdirSync} = require("fs");
            const path = require("path");

            const isDirectory = source => lstatSync(source).isDirectory();
            const getDirectories = source =>
                readdirSync(source).map(name => path.join(source, name)).filter(isDirectory);

            for (const plugin of getDirectories(QMConfig.subatomic.plugins.directory)) {
                const pluginEntry = require(`${plugin}/entry`);
                const entry = new pluginEntry.Entry();

                for (const hook of entry.getListOfHooks()) {
                    if (!PluginManager.availablePlugins.hasOwnProperty(hook)) {
                        PluginManager.availablePlugins[hook] = [];
                    }
                    const pluginName = path.basename(plugin);
                    if (PluginManager.availablePlugins[hook].indexOf(pluginName) === -1) {
                        PluginManager.availablePlugins[hook].push(pluginName);
                    }
                }
            }
        }
    }

    public async preHook(hookedObject: any, command: string) {
        const pluginsToRun = this.getPluginsForHook(command);
        for (const plugin of pluginsToRun) {
            const pluginEntry = require(`${QMConfig.subatomic.plugins.directory}/${plugin}/entry`);
            const entry = new pluginEntry.Entry();
            await entry.runPreHook(hookedObject, new PluginResourceStore());
        }
    }

    public async postHook(hookedObject: any, command: string) {
        const pluginsToRun = this.getPluginsForHook(command);

        for (const plugin of pluginsToRun) {
            const pluginEntry = require(`${QMConfig.subatomic.plugins.directory}/${plugin}/entry`);
            const entry = new pluginEntry.Entry();
            await entry.runPostHook(hookedObject, new PluginResourceStore());
        }
    }

    private getPluginsForHook(command: string) {
        const pluginsToRun = [];
        if (PluginManager.availablePlugins.hasOwnProperty("*")) {
            pluginsToRun.push(...PluginManager.availablePlugins["*"]);
        }
        if (PluginManager.availablePlugins.hasOwnProperty(command)) {
            pluginsToRun.push(...PluginManager.availablePlugins[command]);
        }
        return pluginsToRun;
    }
}
