import { Plugin } from 'obsidian';
import { registerFreeformView } from './freeform/register';

export interface MarkBaseSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: MarkBaseSettings = {
	mySetting: 'default',
};

export default class MarkBasePlugin extends Plugin {
	settings: MarkBaseSettings = DEFAULT_SETTINGS;

	onload(): void {
		void this.loadSettings();
		registerFreeformView(this);
	}

	async loadSettings(): Promise<void> {
		const savedSettings = (await this.loadData()) as Partial<MarkBaseSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
