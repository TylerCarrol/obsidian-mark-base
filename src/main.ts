import { Plugin } from 'obsidian';
import { registerFreeformView } from './freeform/register';

export default class MarkBasePlugin extends Plugin {
	onload(): void {
		registerFreeformView(this);
	}
}
