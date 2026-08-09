import {
	BasesView,
	Component,
	Keymap,
	MarkdownRenderer,
	normalizePath,
	TFile,
	type BasesEntry,
	type BasesPropertyId,
	type QueryController,
} from 'obsidian';
import {
	buildOrderedEntryMarkdown,
	escapeLeadingFrontmatter,
	expandEscapedNewlines,
	getInternalLinkTarget,
	resolvePropertyOrder,
	SOURCE_PATH_ATTRIBUTE,
} from './content';
import { interpolateTemplate } from './template';

export const FREEFORM_VIEW_TYPE = 'freeform';
export const TEMPLATE_OPTION_KEY = 'template';
export const FILE_SEPARATOR_OPTION_KEY = 'separator';
export const LINE_SEPARATOR_OPTION_KEY = 'lineSeparator';
export const DEFAULT_FILE_SEPARATOR = '---';
export const DEFAULT_LINE_SEPARATOR = String.raw`\n`;

export class FreeformView extends BasesView {
	readonly type = FREEFORM_VIEW_TYPE;

	private readonly rootEl: HTMLElement;
	private renderComponent: Component | null = null;
	private renderGeneration = 0;

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.rootEl = parentEl.createDiv({
			cls: [
				'mark-base-playground-freeform',
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
				if (file.path === this.getTemplatePath()) {
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
				cls: 'mark-base-playground-freeform__message',
				text: 'No notes match this Base.',
			});
			return;
		}

		const renderComponent = new Component();
		this.addChild(renderComponent);
		this.renderComponent = renderComponent;
		const fileSeparator = this.getFileSeparator();

		for (const [index, entry] of entries.entries()) {
			if (index > 0 && fileSeparator) {
				await this.renderSeparator(
					fileSeparator,
					entry,
					renderComponent,
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
				);
			} else {
				await this.renderTemplateEntry(
					template,
					entry,
					renderComponent,
				);
			}
			if (generation !== this.renderGeneration) {
				return;
			}
		}
	}

	private async renderTemplateEntry(
		template: string,
		entry: BasesEntry,
		renderComponent: Component,
	): Promise<void> {
		const markdown = interpolateTemplate(template, (propertyId) => {
			const value = entry.getValue(propertyId);
			return value?.toString() ?? '';
		});
		const entryEl = this.rootEl.createDiv({
			cls: 'mark-base-playground-freeform__entry',
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
	): Promise<void> {
		const markdown = buildOrderedEntryMarkdown(
			propertyOrder.map((propertyId) => ({
				propertyId,
				value: entry.getValue(propertyId),
			})),
			entry.file.path,
			this.getLineSeparator(),
		);
		const entryEl = this.rootEl.createDiv({
			cls: 'mark-base-playground-freeform__entry',
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
	): Promise<void> {
		const separatorEl = this.rootEl.createDiv({
			cls: 'mark-base-playground-freeform__separator',
			attr: { [SOURCE_PATH_ATTRIBUTE]: entry.file.path },
		});

		await MarkdownRenderer.render(
			this.app,
			escapeLeadingFrontmatter(separator),
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
			cls: 'mark-base-playground-freeform__message',
			text: message,
		});
	}

	private resetSurface(): void {
		this.clearRenderComponent();
		this.rootEl.empty();
	}

	private clearRenderComponent(): void {
		if (!this.renderComponent) {
			return;
		}

		this.removeChild(this.renderComponent);
		this.renderComponent = null;
	}
}
