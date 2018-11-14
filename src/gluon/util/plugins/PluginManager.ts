import {logger} from "@atomist/automation-client";
import _ = require("lodash");
import {QMConfig} from "../../../config/QMConfig";
import {BaseQMHandler} from "../shared/BaseQMHandler";
import {PluginResourceStore} from "./PluginResourceStore";

export class PluginManager {

    public static async loadAvailablePlugins() {
        if (_.isEmpty(PluginManager.availablePlugins) && !PluginManager.initialised) {
            PluginManager.availablePlugins = {};
            const {lstatSync, readdirSync} = require("fs");
            const path = require("path");

            const isDirectory = source => lstatSync(source).isDirectory();
            const getDirectories = source =>
                readdirSync(source).map(name => path.join(source, name)).filter(isDirectory);

            const fs = require("fs");
            if (!_.isEmpty(QMConfig.subatomic.plugins) && fs.existsSync(QMConfig.subatomic.plugins.directory)) {
                for (const plugin of getDirectories(QMConfig.subatomic.plugins.directory)) {
                    this.tryLoadPlugin(plugin);
                }
            } else {
                logger.warn("Either the config does not specify a plugins directory, or the specified directory does not exist. No plugins loaded!");
            }
            PluginManager.initialised = true;
        }
    }

    private static availablePlugins: { [key: string]: string[] };
    private static initialised: boolean = false;

    private static tryLoadPlugin(pluginDirectory: string) {
        const path = require("path");
        const pluginName = path.basename(pluginDirectory);

        try {

            const pluginEntry = require(`${pluginDirectory}/entry`);
            const entry = new pluginEntry.Entry();

            for (const hook of entry.getListOfHooks()) {
                if (!PluginManager.availablePlugins.hasOwnProperty(hook)) {
                    PluginManager.availablePlugins[hook] = [];
                }
                if (PluginManager.availablePlugins[hook].indexOf(pluginName) === -1) {
                    PluginManager.availablePlugins[hook].push(pluginName);
                }
            }

            logger.info("Successfully loaded plugin: " + pluginName);
        } catch (error) {
            logger.error(`Failed to load plugin: ${pluginName}. Error: ${error}`);
        }
    }

    public async preHook(hookedObject: BaseQMHandler, command: string) {
        const pluginsToRun = this.getPluginsForHook(command);
        const resourceStore: PluginResourceStore = new PluginResourceStore();
        for (const plugin of pluginsToRun) {
            try {
                const pluginEntry = require(`${QMConfig.subatomic.plugins.directory}/${plugin}/entry`);
                const entry = new pluginEntry.Entry();
                await entry.runPreHook(hookedObject, resourceStore);
            } catch (error) {
                logger.error(`Failed to run the preHook for plugin: ${plugin}\nError:\n${error}`);
            }
        }
    }

    public async postHook(hookedObject: BaseQMHandler, command: string) {
        const pluginsToRun = this.getPluginsForHook(command);

        const handlerResult = {
            handlerResult: hookedObject.handlerResult,
            resultMessage: hookedObject.resultMessage,
        };

        const resourceStore: PluginResourceStore = new PluginResourceStore();
        for (const plugin of pluginsToRun) {
            try {
                const pluginEntry = require(`${QMConfig.subatomic.plugins.directory}/${plugin}/entry`);
                const entry = new pluginEntry.Entry();
                await entry.runPostHook(hookedObject, resourceStore, handlerResult);
            } catch (error) {
                logger.error(`Failed to run the postHook for plugin: ${plugin}\nError:\n${error}`);
            }
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
