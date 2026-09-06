import type { BasesAllOptions, Plugin } from 'obsidian';
import {
	ALLOW_OVERRIDES_OPTION_KEY,
	ADD_FILE_CONTENTS_OPTION_KEY,
	DEFAULT_ALLOW_OVERRIDES,
	DEFAULT_ADD_FILE_CONTENTS,
	DEFAULT_FILE_SEPARATOR,
	DEFAULT_LINE_SEPARATOR,
	DEFAULT_EXPORT_FILE,
	DEFAULT_EXPORT_FOLDER,
	DEFAULT_EXPORT_FILE_OPTION_KEY,
	DEFAULT_EXPORT_FOLDER_OPTION_KEY,
	DEFAULT_EXPORT_TYPE,
	DEFAULT_GROUP_BY_CREATES_SEPARATE_OUTPUT_FILES,
	DEFAULT_OPEN_FILE_AFTER_EXPORT,
	DEFAULT_SHOW_EXPORT_BUTTON,
	DEFAULT_STRIP_COMMENTS,
	DEFAULT_STRIP_LINKS,
	DEFAULT_STRIP_YAML_FRONTMATTER,
	DEFAULT_TRIM_WHITESPACE,
	EXPORT_TYPE_OPTION_KEY,
	FILE_SEPARATOR_OPTION_KEY,
	FREEFORM_VIEW_TYPE,
	FreeformView,
	GROUP_BY_CREATES_SEPARATE_OUTPUT_FILES_OPTION_KEY,
	LINE_SEPARATOR_OPTION_KEY,
	OPEN_FILE_AFTER_EXPORT_OPTION_KEY,
	SHOW_EXPORT_BUTTON_OPTION_KEY,
	STRIP_COMMENTS_OPTION_KEY,
	STRIP_LINKS_OPTION_KEY,
	STRIP_YAML_FRONTMATTER_OPTION_KEY,
	TEMPLATE_OPTION_KEY,
	TRIM_WHITESPACE_OPTION_KEY,
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
		type: 'toggle',
		key: ADD_FILE_CONTENTS_OPTION_KEY,
		displayName: 'Add file contents (one-shot button)',
		default: DEFAULT_ADD_FILE_CONTENTS,
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
			{
				type: 'folder',
				key: DEFAULT_EXPORT_FOLDER_OPTION_KEY,
				displayName: 'Default folder',
				default: DEFAULT_EXPORT_FOLDER,
				placeholder: 'Select a vault folder',
			},
			{
				type: 'text',
				key: DEFAULT_EXPORT_FILE_OPTION_KEY,
				displayName: 'Default file',
				default: DEFAULT_EXPORT_FILE,
				placeholder: 'export.md',
			},
			{
				type: 'dropdown',
				key: EXPORT_TYPE_OPTION_KEY,
				displayName: 'Export type',
				default: DEFAULT_EXPORT_TYPE,
				options: {
					markdown: 'Markdown',
				},
			},
			{
				type: 'toggle',
				key: GROUP_BY_CREATES_SEPARATE_OUTPUT_FILES_OPTION_KEY,
				displayName: 'Group by creates separate output files',
				default: DEFAULT_GROUP_BY_CREATES_SEPARATE_OUTPUT_FILES,
			},
			{
				type: 'toggle',
				key: OPEN_FILE_AFTER_EXPORT_OPTION_KEY,
				displayName: 'Open file after export',
				default: DEFAULT_OPEN_FILE_AFTER_EXPORT,
			},
			{
				type: 'toggle',
				key: STRIP_YAML_FRONTMATTER_OPTION_KEY,
				displayName: 'Strip YAML frontmatter',
				default: DEFAULT_STRIP_YAML_FRONTMATTER,
			},
			{
				type: 'toggle',
				key: STRIP_COMMENTS_OPTION_KEY,
				displayName: 'Strip comments',
				default: DEFAULT_STRIP_COMMENTS,
			},
			{
				type: 'toggle',
				key: TRIM_WHITESPACE_OPTION_KEY,
				displayName: 'Trim trailing/leading whitespace',
				default: DEFAULT_TRIM_WHITESPACE,
			},
			{
				type: 'toggle',
				key: STRIP_LINKS_OPTION_KEY,
				displayName: 'Strip links',
				default: DEFAULT_STRIP_LINKS,
			},
			{
				type: 'toggle',
				key: ALLOW_OVERRIDES_OPTION_KEY,
				displayName: 'Allow overrides',
				default: DEFAULT_ALLOW_OVERRIDES,
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
