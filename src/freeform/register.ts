import type { BasesAllOptions, Plugin } from 'obsidian';
import {
	DEFAULT_FILE_SEPARATOR,
	DEFAULT_LINE_SEPARATOR,
	DEFAULT_SHOW_EXPORT_BUTTON,
	FILE_SEPARATOR_OPTION_KEY,
	FREEFORM_VIEW_TYPE,
	FreeformView,
	LINE_SEPARATOR_OPTION_KEY,
	SHOW_EXPORT_BUTTON_OPTION_KEY,
	TEMPLATE_OPTION_KEY,
} from './view';

const FREEFORM_VIEW_OPTIONS: BasesAllOptions[] = [
	{
		type: 'file',
		key: TEMPLATE_OPTION_KEY,
		displayName: 'Template override',
		placeholder: 'Optional; otherwise uses property order',
		filter: (file) => file.extension.toLowerCase() === 'md',
	},
	{
		type: 'text',
		key: FILE_SEPARATOR_OPTION_KEY,
		displayName: 'File separator',
		default: DEFAULT_FILE_SEPARATOR,
		placeholder: String.raw`Markdown; use \n for a new line`,
	},
	{
		type: 'text',
		key: LINE_SEPARATOR_OPTION_KEY,
		displayName: 'Line separator',
		default: DEFAULT_LINE_SEPARATOR,
		placeholder: String.raw`Markdown between properties; use \n\n for a blank line`,
	},
	{
		type: 'group',
		displayName: 'Export',
		items: [
			{
				type: 'toggle',
				key: SHOW_EXPORT_BUTTON_OPTION_KEY,
				displayName: 'Show export button',
				default: DEFAULT_SHOW_EXPORT_BUTTON,
			},
		],
	},
];

export function registerFreeformView(plugin: Plugin): void {
	plugin.registerBasesView(FREEFORM_VIEW_TYPE, {
		name: 'Freeform',
		icon: 'file-text',
		factory: (controller, containerEl) =>
			new FreeformView(controller, containerEl),
		options: () => [...FREEFORM_VIEW_OPTIONS],
	});
}
