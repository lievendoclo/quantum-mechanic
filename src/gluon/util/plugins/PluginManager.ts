import {QMConfig} from "../../../config/QMConfig";
import {PluginResourceStore} from "./PluginResourceStore";

export class PluginManager {

    private readonly availablePlugins: { [key: string]: string[] };

    constructor() {
        this.availablePlugins = {};
    }

    public async loadAvailablePlugins() {
        const {lstatSync, readdirSync} = require("fs");
        const path = require("path");

        const isDirectory = source => lstatSync(source).isDirectory();
        const getDirectories = source =>
            readdirSync(source).map(name => path.join(source, name)).filter(isDirectory);

        for (const plugin of getDirectories(QMConfig.subatomic.plugins.directory)) {
            const pluginEntry = require(`${plugin}/entry`);
            const entry = new pluginEntry.Entry();

            for (const hook of entry.getListOfHooks()) {
                if (!this.availablePlugins.hasOwnProperty(hook)) {
                    this.availablePlugins[hook] = [];
                }
                this.availablePlugins[hook].push(path.basename(plugin));
            }
        }
    }

    public async preHook(hookedObject: any, command: string) {
        const pluginsToRun = [];
        if (this.availablePlugins.hasOwnProperty("*")) {
            pluginsToRun.push(...this.availablePlugins["*"]);
        }
        if (this.availablePlugins.hasOwnProperty(command)) {
            pluginsToRun.push(...this.availablePlugins[command]);
        }

        for (const plugin of pluginsToRun) {
            const pluginEntry = require(`${QMConfig.subatomic.plugins.directory}/${plugin}/entry`);
            const entry = new pluginEntry.Entry();
            await entry.runPreHook(hookedObject, new PluginResourceStore());
        }
    }

    public async postHook(hookedObject: any, command: string) {
        const pluginsToRun = [];
        if (this.availablePlugins.hasOwnProperty("*")) {
            pluginsToRun.push(...this.availablePlugins["*"]);
        }
        if (this.availablePlugins.hasOwnProperty(command)) {
            pluginsToRun.push(...this.availablePlugins[command]);
        }

        for (const plugin of pluginsToRun) {
            const pluginEntry = require(`${QMConfig.subatomic.plugins.directory}/${plugin}/entry`);
            const entry = new pluginEntry.Entry();
            await entry.runPostHook(hookedObject, new PluginResourceStore());
        }
    }
}
