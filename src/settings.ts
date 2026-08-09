import { App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import MarkBasePlugin from './main';

export class MarkBaseSettingTab extends PluginSettingTab {
	plugin: MarkBasePlugin;

	constructor(app: App, plugin: MarkBasePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Settings #1',
				desc: "It's a secret",
				control: {
					type: 'text',
					key: 'mySetting',
					placeholder: 'Enter your secret',
				},
			},
		];
	}
}
