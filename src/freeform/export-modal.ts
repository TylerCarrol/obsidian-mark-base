import { App, Modal, Notice, Setting } from 'obsidian';
import type { ExportOptions } from './export';

export class ExportModal extends Modal {
	private readonly options: ExportOptions;

	constructor(
		app: App,
		options: ExportOptions,
		private readonly onExport: (options: ExportOptions) => Promise<void>,
	) {
		super(app);
		this.options = { ...options };
	}

	onOpen(): void {
		this.contentEl.empty();
		this.contentEl.addClass('mark-base-export-modal');
		this.contentEl.createEl('h2', { text: 'Export freeform view' });

		const overridesEl = this.contentEl.createEl('details', {
			cls: 'mark-base-export-modal__overrides',
		});
		overridesEl.createEl('summary', { text: 'Overrides' });

		this.addToggle(
			overridesEl,
			'Group by creates separate output files',
			'groupByCreatesSeparateOutputFiles',
		);
		this.addToggle(
			overridesEl,
			'Strip YAML frontmatter',
			'stripYamlFrontmatter',
		);
		this.addToggle(overridesEl, 'Strip comments', 'stripComments');
		this.addToggle(
			overridesEl,
			'Trim trailing/leading whitespace',
			'trimWhitespace',
		);
		this.addToggle(overridesEl, 'Strip links', 'stripLinks');

		new Setting(this.contentEl)
			.setName('Folder')
			.setDesc('Vault folder for exported files')
			.addText((text) => {
				text.setPlaceholder('Vault root')
					.setValue(this.options.folder)
					.onChange((value) => {
						this.options.folder = value;
					});
			});

		new Setting(this.contentEl)
			.setName('File')
			.setDesc('Markdown filename')
			.addText((text) => {
				text.setPlaceholder('export.md')
					.setValue(this.options.file)
					.onChange((value) => {
						this.options.file = value;
					});
			});

		new Setting(this.contentEl)
			.setName('Export type')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('markdown', 'Markdown')
					.setValue(this.options.type)
					.onChange(() => {
						this.options.type = 'markdown';
					});
			});

		this.addToggle(
			this.contentEl,
			'Open file after export',
			'openFileAfterExport',
			'Opens each exported file in a separate tab.',
		);

		new Setting(this.contentEl)
			.setClass('mark-base-export-modal__actions')
			.addButton((button) => {
				button.setButtonText('Export').setCta().onClick(() => {
					button.setDisabled(true);
					void this.onExport({ ...this.options })
						.then(() => this.close())
						.catch((error: unknown) => {
							console.error('MarkBase could not export the Freeform view.', error);
							new Notice(
								error instanceof Error
									? error.message
									: 'Unable to export this Freeform view.',
							);
							button.setDisabled(false);
						});
				});
			});
	}

	private addToggle(
		containerEl: HTMLElement,
		name: string,
		key: keyof Pick<
			ExportOptions,
			| 'groupByCreatesSeparateOutputFiles'
			| 'stripYamlFrontmatter'
			| 'stripComments'
			| 'trimWhitespace'
			| 'stripLinks'
			| 'openFileAfterExport'
		>,
		description?: string,
	): void {
		const setting = new Setting(containerEl).setName(name);
		if (description) {
			setting.setDesc(description);
		}
		setting.addToggle((toggle) => {
			toggle.setValue(this.options[key]).onChange((value) => {
				this.options[key] = value;
			});
		});
	}
}