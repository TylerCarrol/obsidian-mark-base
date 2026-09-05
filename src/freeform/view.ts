import {
	BasesView,
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
	buildOrderedEntryMarkdown,
	escapeLeadingFrontmatter,
	expandEscapedNewlines,
	extractMarkdownBody,
	FILE_CONTENTS_PROPERTY_ID,
	getInternalLinkTarget,
	includeFileContentsProperty,
	resolvePropertyOrder,
	SOURCE_PATH_ATTRIBUTE,
} from './content';
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
export const FILE_SEPARATOR_OPTION_KEY = 'separator';
export const LINE_SEPARATOR_OPTION_KEY = 'lineSeparator';
export const SHOW_EXPORT_BUTTON_OPTION_KEY = 'showExportButton';
export const DEFAULT_EXPORT_FOLDER_OPTION_KEY = 'defaultExportFolder';
export const DEFAULT_EXPORT_FILE_OPTION_KEY = 'defaultExportFile';
export const EXPORT_TYPE_OPTION_KEY = 'exportType';
export const STRIP_YAML_FRONTMATTER_OPTION_KEY = 'stripYamlFrontmatter';
export const STRIP_COMMENTS_OPTION_KEY = 'stripComments';
export const TRIM_WHITESPACE_OPTION_KEY = 'trimWhitespace';
export const STRIP_LINKS_OPTION_KEY = 'stripLinks';
export const GROUP_BY_CREATES_SEPARATE_OUTPUT_FILES_OPTION_KEY =
	'groupByCreatesSeparateOutputFiles';
export const DEFAULT_FILE_SEPARATOR = '---';
export const DEFAULT_LINE_SEPARATOR = String.raw`\n`;
export const DEFAULT_SHOW_EXPORT_BUTTON = false;
export const DEFAULT_EXPORT_FOLDER = '';
export const DEFAULT_EXPORT_FILE = 'export.md';
export const DEFAULT_EXPORT_TYPE = 'markdown';
export const DEFAULT_STRIP_YAML_FRONTMATTER = false;
export const DEFAULT_STRIP_COMMENTS = false;
export const DEFAULT_TRIM_WHITESPACE = false;
export const DEFAULT_STRIP_LINKS = false;
export const DEFAULT_GROUP_BY_CREATES_SEPARATE_OUTPUT_FILES = false;

export class FreeformView extends BasesView {
	readonly type = FREEFORM_VIEW_TYPE;

	private readonly rootEl: HTMLElement;
	private renderComponent: Component | null = null;
	private renderGeneration = 0;

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
					name: group.key?.toString() ?? 'Ungrouped',
				}))
			: [{ entries, name: null }];

		for (const group of outputGroups) {
			const outputEl = group.name !== null
				? this.createOutputPreview(group.name)
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
					);
				} else {
					await this.renderTemplateEntry(
						template,
						entry,
						renderComponent,
						outputEl,
						transformOptions,
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
	): Promise<void> {
		const fileContents = template.includes(FILE_CONTENTS_PROPERTY_ID)
			? await this.readFileContent(
					entry,
					transformOptions.stripYamlFrontmatter,
				)
			: null;
		const markdown = transformExportMarkdown(
			interpolateTemplate(template, (propertyId) => {
				if (propertyId === FILE_CONTENTS_PROPERTY_ID) {
					return fileContents ?? '';
				}

				const value = entry.getValue(propertyId);
				return value?.toString() ?? '';
			}),
			transformOptions,
		);
		const entryEl = outputEl.createDiv({
			cls: 'mark-base-freeform__entry',
			attr: { [SOURCE_PATH_ATTRIBUTE]: entry.file.path },
		});

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
	): Promise<void> {
		const fileContents = propertyOrder.includes(FILE_CONTENTS_PROPERTY_ID)
			? await this.readFileContent(
					entry,
					transformOptions.stripYamlFrontmatter,
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
		);
		const entryEl = outputEl.createDiv({
			cls: 'mark-base-freeform__entry',
			attr: { [SOURCE_PATH_ATTRIBUTE]: entry.file.path },
		});

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
		stripYamlFrontmatter: boolean,
	): Promise<string> {
		const content = await this.app.vault.cachedRead(entry.file);
		return stripYamlFrontmatter ? extractMarkdownBody(content) : content;
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

	private createOutputPreview(groupName: string): HTMLElement {
		const outputEl = this.rootEl.createDiv({
			cls: 'mark-base-freeform__output',
		});
		outputEl.createDiv({
			cls: 'mark-base-freeform__output-name',
			text: groupName,
		});
		return outputEl;
	}

	private renderExportButton(): void {
		if (!this.getShowExportButton()) {
			return;
		}

		const barEl = this.rootEl.createDiv({
			cls: 'mark-base-freeform__export-bar',
		});
		const buttonEl = barEl.createEl('button', {
			cls: 'mark-base-freeform__export-button',
			text: 'Export',
		});
		buttonEl.addEventListener('click', () => {
			new ExportModal(
				this.app,
				this.getExportOptions(),
				(options) => this.exportMarkdown(options),
			).open();
		});
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
		for (const output of outputs) {
			const existingFile = this.app.vault.getAbstractFileByPath(output.path);
			if (existingFile instanceof TFolder) {
				throw new Error(`The export path "${output.path}" is a folder.`);
			}
			if (existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, output.markdown);
			} else {
				await this.app.vault.create(output.path, output.markdown);
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
		);

		for (const [index, entry] of entries.entries()) {
			if (index > 0 && separator) {
				parts.push(separator);
			}
			parts.push(
				await this.buildEntryExportMarkdown(
					entry,
					template,
					propertyOrder,
					options,
				),
			);
		}

		return parts.join('\n');
	}

	private async buildEntryExportMarkdown(
		entry: BasesEntry,
		template: string | null,
		propertyOrder: BasesPropertyId[],
		options: ExportOptions,
	): Promise<string> {
		if (template !== null) {
			const fileContents = template.includes(FILE_CONTENTS_PROPERTY_ID)
				? await this.readFileContent(entry, options.stripYamlFrontmatter)
				: null;
			return transformExportMarkdown(
				interpolateTemplate(template, (propertyId) => {
					if (propertyId === FILE_CONTENTS_PROPERTY_ID) {
						return fileContents ?? '';
					}
					return entry.getValue(propertyId)?.toString() ?? '';
				}),
				options,
			);
		}

		const fileContents = propertyOrder.includes(FILE_CONTENTS_PROPERTY_ID)
			? await this.readFileContent(entry, options.stripYamlFrontmatter)
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
		this.renderExportButton();
	}

	private clearRenderComponent(): void {
		if (!this.renderComponent) {
			return;
		}

		this.removeChild(this.renderComponent);
		this.renderComponent = null;
	}
}
