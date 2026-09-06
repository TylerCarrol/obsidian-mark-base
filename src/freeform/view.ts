import {
	BasesView,
	BooleanValue,
	Component,
	Keymap,
	MarkdownRenderer,
	Notice,
	normalizePath,
	TFile,
	TFolder,
	type BasesEntry,
	type BasesPropertyId,
	type QueryController,
} from 'obsidian';
import {
	appendFileContentsProperty,
	buildOrderedEntryMarkdown,
	escapeLeadingFrontmatter,
	expandEscapedNewlines,
	extractMarkdownBody,
	FILE_CONTENTS_PROPERTY_ID,
	getInternalLinkTarget,
	includeFileContentsProperty,
	resolvePropertyOrder,
	SOURCE_PATH_ATTRIBUTE,
	trimFileBoundaryWhitespace,
} from './content';
import { parseDocument } from 'yaml';
import {
	type ExportOptions,
	type ExportTransformOptions,
	getExportFileName,
	getExportPath,
	transformExportMarkdown,
} from './export';
import { ExportModal } from './export-modal';
import { interpolateTemplate } from './template';

export const FREEFORM_VIEW_TYPE = 'freeform';
export const TEMPLATE_OPTION_KEY = 'template';
export const ADD_FILE_CONTENTS_OPTION_KEY = 'addFileContents';
export const FILE_SEPARATOR_OPTION_KEY = 'separator';
export const LINE_SEPARATOR_OPTION_KEY = 'lineSeparator';
export const SHOW_EXPORT_BUTTON_OPTION_KEY = 'showExportButton';
export const ALLOW_OVERRIDES_OPTION_KEY = 'allowOverrides';
export const DEFAULT_EXPORT_FOLDER_OPTION_KEY = 'defaultExportFolder';
export const DEFAULT_EXPORT_FILE_OPTION_KEY = 'defaultExportFile';
export const EXPORT_TYPE_OPTION_KEY = 'exportType';
export const STRIP_YAML_FRONTMATTER_OPTION_KEY = 'stripYamlFrontmatter';
export const STRIP_COMMENTS_OPTION_KEY = 'stripComments';
export const TRIM_WHITESPACE_OPTION_KEY = 'trimWhitespace';
export const STRIP_LINKS_OPTION_KEY = 'stripLinks';
export const GROUP_BY_CREATES_SEPARATE_OUTPUT_FILES_OPTION_KEY =
	'groupByCreatesSeparateOutputFiles';
export const OPEN_FILE_AFTER_EXPORT_OPTION_KEY = 'openFileAfterExport';
export const DEFAULT_FILE_SEPARATOR = '---';
export const DEFAULT_LINE_SEPARATOR = String.raw`\n`;
export const DEFAULT_SHOW_EXPORT_BUTTON = false;
export const DEFAULT_ALLOW_OVERRIDES = true;
export const DEFAULT_EXPORT_FOLDER = '';
export const DEFAULT_EXPORT_FILE = 'export.md';
export const DEFAULT_EXPORT_TYPE = 'markdown';
export const DEFAULT_STRIP_YAML_FRONTMATTER = false;
export const DEFAULT_STRIP_COMMENTS = false;
export const DEFAULT_TRIM_WHITESPACE = false;
export const DEFAULT_STRIP_LINKS = false;
export const DEFAULT_GROUP_BY_CREATES_SEPARATE_OUTPUT_FILES = false;
export const DEFAULT_OPEN_FILE_AFTER_EXPORT = false;
export const DEFAULT_ADD_FILE_CONTENTS = false;

function stringifyGroupValue(value: unknown): string {
	if (value === undefined || value === null) {
		return '';
	}
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return String((value as { toString(): string }).toString());
}

function isBooleanGroupValue(value: unknown): boolean {
	if (typeof value === 'boolean' || value instanceof BooleanValue) {
		return true;
	}
	if (typeof value !== 'string') {
		return false;
	}
	const normalized = value.trim().toLowerCase();
	return normalized === 'true' || normalized === 'false';
}

function getBooleanGroupValue(value: unknown): boolean {
	if (typeof value === 'boolean') {
		return value;
	}
	if (value instanceof BooleanValue) {
		return value.isTruthy();
	}
	return String(value).trim().toLowerCase() === 'true';
}

function renderGroupValue(
	container: HTMLElement,
	app: FreeformView['app'],
	sourcePath: string,
	value: unknown,
): void {
	if (isBooleanGroupValue(value)) {
		const checkbox = container.createEl('input', {
			cls: 'mark-base-freeform__group-checkbox',
			attr: { type: 'checkbox' },
		});
		checkbox.checked = getBooleanGroupValue(value);
		checkbox.disabled = true;
		return;
	}

	const stringValue = stringifyGroupValue(value);
	const linkPattern = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)]+)\)/g;
	let cursor = 0;
	let match: RegExpExecArray | null;
	while ((match = linkPattern.exec(stringValue)) !== null) {
		if (match.index > cursor) {
			container.createSpan({ text: stringValue.slice(cursor, match.index) });
		}

		const target = match[1] ?? match[5] ?? '';
		const label = match[3] ?? match[4] ?? match[1] ?? '';
		if (/^https?:\/\//i.test(target)) {
			container.createEl('a', {
				text: label,
				href: target,
				attr: { target: '_blank', rel: 'noopener noreferrer' },
			});
		} else {
			const linkTarget = match[1]
				? `${match[1]}${match[2] ? `#${match[2]}` : ''}`
				: target;
			const file = app.metadataCache.getFirstLinkpathDest(target, sourcePath);
			if (file) {
				const link = container.createEl('a', {
					cls: 'internal-link',
					text: label,
				});
				link.setAttribute('data-href', linkTarget);
			} else {
				container.createSpan({ text: label });
			}
		}
		cursor = match.index + match[0].length;
	}

	if (cursor < stringValue.length) {
		container.createSpan({ text: stringValue.slice(cursor) });
	}
	if (cursor === 0 && stringValue.length === 0) {
		container.createSpan({ text: 'No value' });
	}
}

export class FreeformView extends BasesView {
	readonly type = FREEFORM_VIEW_TYPE;

	private readonly rootEl: HTMLElement;
	private renderComponent: Component | null = null;
	private renderGeneration = 0;
	private fileContentsUpdateInProgress = false;

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.allProperties = includeFileContentsProperty(this.allProperties);
		this.rootEl = parentEl.createDiv({
			cls: [
				'mark-base-freeform',
				'markdown-rendered',
				'markdown-preview-view',
			],
			attr: { 'data-ignore-swipe': 'true' },
		});
	}

	onload(): void {
		this.registerDomEvent(this.rootEl, 'click', (event) => {
			this.openInternalLink(event);
		});
		this.registerDomEvent(this.rootEl, 'auxclick', (event) => {
			if (event.button === 1) {
				this.openInternalLink(event);
			}
		});
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				const isDisplayedFile = this.data.data.some(
					(entry) => entry.file.path === file.path,
				);
				if (file.path === this.getTemplatePath() || isDisplayedFile) {
					this.requestRender();
				}
			}),
		);
		this.requestRender();
	}

	onDataUpdated(): void {
		if (
			this.getBooleanOption(ADD_FILE_CONTENTS_OPTION_KEY, false) &&
			!this.fileContentsUpdateInProgress
		) {
			this.config.set(ADD_FILE_CONTENTS_OPTION_KEY, false);
			this.fileContentsUpdateInProgress = true;
			void this.addFileContentsToBaseOrder()
				.catch((error: unknown) => {
					new Notice(
						error instanceof Error
							? error.message
							: 'Unable to add file contents to the property order.',
					);
				})
				.finally(() => {
					this.fileContentsUpdateInProgress = false;
				});
		}
		this.requestRender();
	}

	onunload(): void {
		this.renderGeneration++;
		this.clearRenderComponent();
		this.rootEl.remove();
	}

	private requestRender(): void {
		const generation = ++this.renderGeneration;

		void this.render(generation).catch((error: unknown) => {
			if (generation !== this.renderGeneration) {
				return;
			}

			console.error('MarkBase could not render the Freeform view.', error);
			this.showMessage('Unable to render this Freeform view.');
		});
	}

	private async render(generation: number): Promise<void> {
		const templatePath = this.getTemplatePath();
		let template: string | null = null;
		if (templatePath) {
			const templateFile =
				this.app.vault.getAbstractFileByPath(templatePath);
			if (
				!(templateFile instanceof TFile) ||
				templateFile.extension.toLowerCase() !== 'md'
			) {
				this.showMessage(
					'The configured Markdown template was not found.',
				);
				return;
			}

			template = await this.app.vault.read(templateFile);
			if (generation !== this.renderGeneration) {
				return;
			}
		}

		const propertyOrder =
			template === null ? this.getPropertyOrder() : [];
		if (template === null && propertyOrder.length === 0) {
			this.showMessage(
				'Choose properties to display or select a Markdown template.',
			);
			return;
		}

		const entries = this.data.data;
		this.resetSurface();

		if (entries.length === 0) {
			this.rootEl.createDiv({
				cls: 'mark-base-freeform__message',
				text: 'No notes match this Base.',
			});
			return;
		}

		const renderComponent = new Component();
		this.addChild(renderComponent);
		this.renderComponent = renderComponent;
		const fileSeparator = this.getFileSeparator();
		const transformOptions = this.getExportTransformOptions();
		const groupedData = this.data.groupedData;
		const renderSeparateOutputs =
			this.getGroupByCreatesSeparateOutputFiles() &&
			groupedData.some((group) => group.hasKey());
		const outputGroups = renderSeparateOutputs
			? groupedData.map((group) => ({
					entries: group.entries,
					name: stringifyGroupValue(group.key) || 'Ungrouped',
					key: group.key,
				}))
			: [{ entries, name: null }];
		const groupPropertyLabel = renderSeparateOutputs
			? this.getGroupPropertyLabel(groupedData, entries)
			: null;

		for (const group of outputGroups) {
			const outputEl = group.name !== null
				? this.createOutputPreview(
						groupPropertyLabel ?? 'Group',
						group.key,
						group.entries[0]?.file.path ?? '',
					)
				: this.rootEl;

			for (const [index, entry] of group.entries.entries()) {
				if (index > 0 && fileSeparator) {
					await this.renderSeparator(
						fileSeparator,
						entry,
						renderComponent,
						outputEl,
						transformOptions,
					);
					if (generation !== this.renderGeneration) {
						return;
					}
				}

				if (template === null) {
					await this.renderOrderedEntry(
						propertyOrder,
						entry,
						renderComponent,
						outputEl,
						transformOptions,
						index === 0,
						index === group.entries.length - 1,
					);
				} else {
					await this.renderTemplateEntry(
						template,
						entry,
						renderComponent,
						outputEl,
						transformOptions,
						index === 0,
						index === group.entries.length - 1,
					);
				}
				if (generation !== this.renderGeneration) {
					return;
				}
			}
		}
	}

	private async renderTemplateEntry(
		template: string,
		entry: BasesEntry,
		renderComponent: Component,
		outputEl: HTMLElement,
		transformOptions: ExportTransformOptions,
		trimStart: boolean,
		trimEnd: boolean,
	): Promise<void> {
		const fileContents = template.includes(FILE_CONTENTS_PROPERTY_ID)
			? await this.readFileContent(
					entry,
					transformOptions.trimWhitespace,
				)
			: null;
		const markdown = transformExportMarkdown(
			interpolateTemplate(template, (propertyId) => {
				if (propertyId === FILE_CONTENTS_PROPERTY_ID) {
					return fileContents ?? '';
				}

				const value = entry.getValue(propertyId);
				return expandEscapedNewlines(value?.toString() ?? '');
			}),
			transformOptions,
			{ trimStart, trimEnd },
		);
		const entryEl = outputEl.createDiv({
			cls: 'mark-base-freeform__entry',
			attr: { [SOURCE_PATH_ATTRIBUTE]: entry.file.path },
		});
		this.renderLeadingNewlines(entryEl, markdown);

		await MarkdownRenderer.render(
			this.app,
			markdown,
			entryEl,
			entry.file.path,
			renderComponent,
		);
	}

	private async renderOrderedEntry(
		propertyOrder: BasesPropertyId[],
		entry: BasesEntry,
		renderComponent: Component,
		outputEl: HTMLElement,
		transformOptions: ExportTransformOptions,
		trimStart: boolean,
		trimEnd: boolean,
	): Promise<void> {
		const fileContents = propertyOrder.includes(FILE_CONTENTS_PROPERTY_ID)
			? await this.readFileContent(
					entry,
					transformOptions.trimWhitespace,
				)
			: null;
		const markdown = transformExportMarkdown(
			buildOrderedEntryMarkdown(
				propertyOrder.map((propertyId) => ({
					propertyId,
					value:
						propertyId === FILE_CONTENTS_PROPERTY_ID
							? fileContents
							: entry.getValue(propertyId),
				})),
				entry.file.path,
				this.getLineSeparator(),
			),
			transformOptions,
			{ trimStart, trimEnd },
		);
		const entryEl = outputEl.createDiv({
			cls: 'mark-base-freeform__entry',
			attr: { [SOURCE_PATH_ATTRIBUTE]: entry.file.path },
		});
		this.renderLeadingNewlines(entryEl, markdown);

		if (!markdown) {
			return;
		}

		await MarkdownRenderer.render(
			this.app,
			markdown,
			entryEl,
			entry.file.path,
			renderComponent,
		);
	}

	private renderLeadingNewlines(
		entryEl: HTMLElement,
		markdown: string,
	): void {
		const leadingNewlines = markdown.match(/^(?:\r?\n)+/)?.[0];
		const newlineCount = leadingNewlines?.match(/\n/g)?.length ?? 0;
		for (let index = 0; index < newlineCount; index++) {
			entryEl.createEl('br', {
				cls: 'mark-base-freeform__boundary-newline',
			});
		}
	}

	private async renderSeparator(
		separator: string,
		entry: BasesEntry,
		renderComponent: Component,
		outputEl: HTMLElement,
		transformOptions: ExportTransformOptions,
	): Promise<void> {
		const separatorEl = outputEl.createDiv({
			cls: 'mark-base-freeform__separator',
			attr: { [SOURCE_PATH_ATTRIBUTE]: entry.file.path },
		});

		await MarkdownRenderer.render(
			this.app,
			escapeLeadingFrontmatter(
				transformExportMarkdown(separator, transformOptions),
			),
			separatorEl,
			entry.file.path,
			renderComponent,
		);
	}

	private getTemplatePath(): string | null {
		const configured = this.config.get(TEMPLATE_OPTION_KEY);
		if (typeof configured !== 'string' || !configured.trim()) {
			return null;
		}

		return normalizePath(configured.trim());
	}

	private getFileSeparator(): string {
		const configured = this.config.get(FILE_SEPARATOR_OPTION_KEY);
		return expandEscapedNewlines(
			typeof configured === 'string'
				? configured
				: DEFAULT_FILE_SEPARATOR,
		);
	}

	private getLineSeparator(): string {
		const configured = this.config.get(LINE_SEPARATOR_OPTION_KEY);
		return expandEscapedNewlines(
			typeof configured === 'string'
				? configured
				: DEFAULT_LINE_SEPARATOR,
		);
	}

	private getPropertyOrder(): BasesPropertyId[] {
		return resolvePropertyOrder(
			this.config.getOrder(),
			this.data.properties,
		);
	}

	private async readFileContent(
		entry: BasesEntry,
		trimWhitespace: boolean,
	): Promise<string> {
		const content = await this.app.vault.cachedRead(entry.file);
		const markdown = extractMarkdownBody(content);
		return trimWhitespace
			? trimFileBoundaryWhitespace(markdown)
			: markdown;
	}

	private getExportTransformOptions(): ExportTransformOptions {
		return {
			stripYamlFrontmatter: this.getBooleanOption(
				STRIP_YAML_FRONTMATTER_OPTION_KEY,
				DEFAULT_STRIP_YAML_FRONTMATTER,
			),
			stripComments: this.getBooleanOption(
				STRIP_COMMENTS_OPTION_KEY,
				DEFAULT_STRIP_COMMENTS,
			),
			trimWhitespace: this.getBooleanOption(
				TRIM_WHITESPACE_OPTION_KEY,
				DEFAULT_TRIM_WHITESPACE,
			),
			stripLinks: this.getBooleanOption(
				STRIP_LINKS_OPTION_KEY,
				DEFAULT_STRIP_LINKS,
			),
		};
	}

	private getExportOptions(): ExportOptions {
		const configuredType = this.config.get(EXPORT_TYPE_OPTION_KEY);

		return {
			...this.getExportTransformOptions(),
			folder: this.getStringOption(
				DEFAULT_EXPORT_FOLDER_OPTION_KEY,
				DEFAULT_EXPORT_FOLDER,
			),
			file: this.getStringOption(
				DEFAULT_EXPORT_FILE_OPTION_KEY,
				DEFAULT_EXPORT_FILE,
			),
			type: configuredType === 'markdown' ? configuredType : DEFAULT_EXPORT_TYPE,
			groupByCreatesSeparateOutputFiles:
				this.getGroupByCreatesSeparateOutputFiles(),
			openFileAfterExport: this.getBooleanOption(
				OPEN_FILE_AFTER_EXPORT_OPTION_KEY,
				DEFAULT_OPEN_FILE_AFTER_EXPORT,
			),
		};
	}

	private getGroupByCreatesSeparateOutputFiles(): boolean {
		return this.getBooleanOption(
			GROUP_BY_CREATES_SEPARATE_OUTPUT_FILES_OPTION_KEY,
			DEFAULT_GROUP_BY_CREATES_SEPARATE_OUTPUT_FILES,
		);
	}

	private getBooleanOption(key: string, defaultValue: boolean): boolean {
		const configured = this.config.get(key);
		return typeof configured === 'boolean' ? configured : defaultValue;
	}

	private getStringOption(key: string, defaultValue: string): string {
		const configured = this.config.get(key);
		return typeof configured === 'string' ? configured : defaultValue;
	}

	private getShowExportButton(): boolean {
		return this.getBooleanOption(
			SHOW_EXPORT_BUTTON_OPTION_KEY,
			DEFAULT_SHOW_EXPORT_BUTTON,
		);
	}

	private getAllowOverrides(): boolean {
		return this.getBooleanOption(
			ALLOW_OVERRIDES_OPTION_KEY,
			DEFAULT_ALLOW_OVERRIDES,
		);
	}

	private getGroupPropertyLabel(
		groups: Array<{
			key?: unknown;
			hasKey?: () => boolean;
			entries: BasesEntry[];
		}>,
		entries: BasesEntry[],
	): string {
		const candidateProperties = [
			...this.data.properties,
			...this.allProperties,
		].filter((propertyId, index, array) => array.indexOf(propertyId) === index);
		let bestProperty: BasesPropertyId | undefined;
		let bestScore = 0;

		for (const propertyId of candidateProperties) {
			let score = 0;
			for (const group of groups) {
				if (!group.hasKey?.() || group.key === undefined || group.key === null) {
					continue;
				}
				const groupValue = stringifyGroupValue(group.key);
				if (
					group.entries?.some(
						(entry) => entry.getValue(propertyId)?.toString() === groupValue,
					)
				) {
					score++;
				}
			}
			if (score > bestScore) {
				bestProperty = propertyId;
				bestScore = score;
			}
		}

		return bestProperty
			? this.config.getDisplayName(bestProperty)
			: this.data.properties[0]
				? this.config.getDisplayName(this.data.properties[0])
				: entries.length > 0
					? 'Group'
					: 'Group';
	}

	private createOutputPreview(
		propertyLabel: string,
		groupValue: unknown,
		sourcePath: string,
	): HTMLElement {
		const outputEl = this.rootEl.createDiv({
			cls: 'mark-base-freeform__output',
			attr: { [SOURCE_PATH_ATTRIBUTE]: sourcePath },
		});
		const headerEl = outputEl.createDiv({
			cls: 'mark-base-freeform__output-name',
		});
		headerEl.createSpan({ text: `${propertyLabel} ` });
		renderGroupValue(headerEl, this.app, sourcePath, groupValue);
		return outputEl;
	}

	private renderActionBar(): void {
		if (!this.getShowExportButton()) {
			return;
		}

		const barEl = this.rootEl.createDiv({
			cls: 'mark-base-freeform__export-bar',
		});
		if (this.getShowExportButton()) {
			const buttonEl = barEl.createEl('button', {
				cls: 'mark-base-freeform__export-button',
				text: 'Export',
			});
			buttonEl.addEventListener('click', () => {
				const options = this.getExportOptions();
				if (!this.getAllowOverrides()) {
					buttonEl.disabled = true;
					void this.exportMarkdown(options)
						.catch((error: unknown) => {
							console.error(
								'MarkBase could not export the Freeform view.',
								error,
							);
							new Notice(
								error instanceof Error
									? error.message
									: 'Unable to export this Freeform view.',
							);
						})
						.finally(() => {
							buttonEl.disabled = false;
						});
					return;
				}

				new ExportModal(
					this.app,
					options,
					(options) => this.exportMarkdown(options),
				).open();
			});
		}

	}

	private async addFileContentsToBaseOrder(): Promise<void> {
		await this.updateFileContentsInBaseOrder();
	}

	private async updateFileContentsInBaseOrder(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension.toLowerCase() !== 'base') {
			throw new Error('Open the Base file that contains this Freeform view first.');
		}

		const document = parseDocument(await this.app.vault.read(activeFile));
		const views = document.get('views');
		if (
			!views ||
			typeof views !== 'object' ||
			!('items' in views) ||
			!Array.isArray(views.items)
		) {
			throw new Error('The active Base file has no views.');
		}

		const baseConfig = document.toJSON() as {
			views?: Array<{ type?: unknown; name?: unknown }>;
		};
		const viewIndex = baseConfig.views?.findIndex(
			(view) =>
				view.type === FREEFORM_VIEW_TYPE &&
				view.name === this.config.name,
		);
		if (viewIndex === undefined || viewIndex === -1) {
			throw new Error('The current Freeform view was not found in the Base file.');
		}

		const propertyOrder = resolvePropertyOrder(
			this.config.getOrder(),
			this.data.properties,
		);
		document.setIn(
			['views', viewIndex, 'order'],
			appendFileContentsProperty(propertyOrder),
		);
		await this.app.vault.modify(activeFile, document.toString());
	}

	private async exportMarkdown(options: ExportOptions): Promise<void> {
		const template = await this.readTemplate();
		const propertyOrder = template === null ? this.getPropertyOrder() : [];
		if (template === null && propertyOrder.length === 0) {
			throw new Error(
				'Choose properties to display or select a Markdown template before exporting.',
			);
		}

		const groupedData = this.data.groupedData;
		const separateGroups =
			options.groupByCreatesSeparateOutputFiles &&
			groupedData.some((group) => group.hasKey());
		const outputGroups = separateGroups
			? groupedData.map((group) => ({
					entries: group.entries,
					name: group.key?.toString() ?? 'Ungrouped',
				}))
			: [{ entries: this.data.data, name: undefined }];
		const paths = new Set<string>();
		const outputs: { path: string; markdown: string }[] = [];

		for (const group of outputGroups) {
			const fileName = getExportFileName(options.file, group.name);
			const path = normalizePath(getExportPath(options.folder, fileName));
			if (paths.has(path)) {
				throw new Error(`Multiple groups resolve to the export file "${path}".`);
			}
			paths.add(path);

			outputs.push({
				path,
				markdown: await this.buildExportMarkdown(
					group.entries,
					template,
					propertyOrder,
					options,
				),
			});
		}

		await this.ensureExportFolder(options.folder);
		const exportedFiles: TFile[] = [];
		for (const output of outputs) {
			const existingFile = this.app.vault.getAbstractFileByPath(output.path);
			if (existingFile instanceof TFolder) {
				throw new Error(`The export path "${output.path}" is a folder.`);
			}
			if (existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, output.markdown);
				exportedFiles.push(existingFile);
			} else {
				exportedFiles.push(
					await this.app.vault.create(output.path, output.markdown),
				);
			}
		}
		if (options.openFileAfterExport) {
			for (const exportedFile of exportedFiles) {
				await this.app.workspace.getLeaf('tab').openFile(exportedFile);
			}
		}

		new Notice(
			paths.size === 1
				? `Exported to ${[...paths][0]}.`
				: `Exported ${paths.size} Markdown files.`,
		);
	}

	private async readTemplate(): Promise<string | null> {
		const templatePath = this.getTemplatePath();
		if (!templatePath) {
			return null;
		}

		const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
		if (
			!(templateFile instanceof TFile) ||
			templateFile.extension.toLowerCase() !== 'md'
		) {
			throw new Error('The configured Markdown template was not found.');
		}

		return this.app.vault.read(templateFile);
	}

	private async buildExportMarkdown(
		entries: BasesEntry[],
		template: string | null,
		propertyOrder: BasesPropertyId[],
		options: ExportOptions,
	): Promise<string> {
		const parts: string[] = [];
		const separator = transformExportMarkdown(
			this.getFileSeparator(),
			options,
			{ trimStart: false, trimEnd: false },
		);
		const untrimmedOptions = { ...options, trimWhitespace: false };

		for (const [index, entry] of entries.entries()) {
			if (index > 0 && separator) {
				parts.push(separator);
			}
			parts.push(
				await this.buildEntryExportMarkdown(
					entry,
					template,
					propertyOrder,
					untrimmedOptions,
					options.trimWhitespace,
				),
			);
		}

		const markdown = parts.join('\n');
		return options.trimWhitespace ? markdown.trim() : markdown;
	}

	private async buildEntryExportMarkdown(
		entry: BasesEntry,
		template: string | null,
		propertyOrder: BasesPropertyId[],
		options: ExportOptions,
		trimFileWhitespace: boolean,
	): Promise<string> {
		if (template !== null) {
			const fileContents = template.includes(FILE_CONTENTS_PROPERTY_ID)
				? await this.readFileContent(
						entry,
						trimFileWhitespace,
					)
				: null;
			return transformExportMarkdown(
				interpolateTemplate(template, (propertyId) => {
					if (propertyId === FILE_CONTENTS_PROPERTY_ID) {
						return fileContents ?? '';
					}
					return expandEscapedNewlines(
						entry.getValue(propertyId)?.toString() ?? '',
					);
				}),
				options,
			);
		}

		const fileContents = propertyOrder.includes(FILE_CONTENTS_PROPERTY_ID)
			? await this.readFileContent(
					entry,
					trimFileWhitespace,
				)
			: null;
		return transformExportMarkdown(
			buildOrderedEntryMarkdown(
				propertyOrder.map((propertyId) => ({
					propertyId,
					value:
						propertyId === FILE_CONTENTS_PROPERTY_ID
							? fileContents
							: entry.getValue(propertyId),
				})),
				entry.file.path,
				this.getLineSeparator(),
			),
			options,
		);
	}

	private async ensureExportFolder(folder: string): Promise<void> {
		const normalizedFolder = normalizePath(folder.trim());
		if (!normalizedFolder || normalizedFolder === '/') {
			return;
		}

		let currentPath = '';
		for (const segment of normalizedFolder.split('/').filter(Boolean)) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			const existing = this.app.vault.getAbstractFileByPath(currentPath);
			if (existing instanceof TFile) {
				throw new Error(`The export folder "${currentPath}" is a file.`);
			}
			if (!existing) {
				await this.app.vault.createFolder(currentPath);
			}
		}
	}

	private openInternalLink(event: MouseEvent): void {
		const eventTarget = event.target as Node | null;
		if (!eventTarget?.instanceOf(Element)) {
			return;
		}

		const linkEl =
			eventTarget.closest<HTMLAnchorElement>('a.internal-link');
		if (!linkEl || !this.rootEl.contains(linkEl)) {
			return;
		}

		const target = getInternalLinkTarget(linkEl);
		if (!target) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		void this.app.workspace.openLinkText(
			target.linktext,
			target.sourcePath,
			Keymap.isModEvent(event),
		);
	}

	private showMessage(message: string): void {
		this.resetSurface();
		this.rootEl.createDiv({
			cls: 'mark-base-freeform__message',
			text: message,
		});
	}

	private resetSurface(): void {
		this.clearRenderComponent();
		this.rootEl.empty();
		this.renderActionBar();
	}

	private clearRenderComponent(): void {
		if (!this.renderComponent) {
			return;
		}

		this.removeChild(this.renderComponent);
		this.renderComponent = null;
	}
}
