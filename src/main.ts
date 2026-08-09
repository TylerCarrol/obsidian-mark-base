import { Plugin } from 'obsidian';
import { registerFreeformView } from './freeform/register';

export interface MyPluginSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
};

export default class MarkBasePlugin extends Plugin {
	settings: MyPluginSettings = DEFAULT_SETTINGS;

	onload(): void {
		void this.loadSettings();
		registerFreeformView(this);
	}

	async loadSettings(): Promise<void> {
		const savedSettings = (await this.loadData()) as Partial<MyPluginSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
