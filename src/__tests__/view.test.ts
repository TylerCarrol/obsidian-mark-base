import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Component } from 'obsidian';
import { FreeformFolding } from '../freeform/folding';
import {
	FreeformView,
	ENABLE_HEADING_FOLDING_OPTION_KEY,
	ENABLE_NOTE_FOLDING_OPTION_KEY,
	GROUP_BY_CREATES_SEPARATE_OUTPUT_FILES_OPTION_KEY,
	SHOW_EXPORT_BUTTON_OPTION_KEY,
} from '../freeform/view';

const fixtures = (() => {
	const first = { file: { path: 'First.md' }, getValue: () => 'First' };
	const second = { file: { path: 'Second.md' }, getValue: () => 'Second' };
	return {
		settings: new Map<string, boolean>(),
		entries: [first, second],
		groups: [
			{ key: 'First', hasKey: () => true, entries: [first] },
			{ key: 'Second', hasKey: () => true, entries: [second] },
		],
	};
})();

describe('Freeform view grouping', () => {
	beforeEach(() => {
		fixtures.settings.clear();
		for (const group of fixtures.groups) {
			group.hasKey = () => true;
		}
	});

	describe('Freeform view folding', () => {
		function addCreateEl(element: HTMLElement): void {
			Object.assign(element, {
				createEl: (tagName: string, options?: { cls?: string; attr?: Record<string, string>; text?: string }) => {
					const child = document.createElement(tagName);
					child.className = options?.cls ?? '';
					child.textContent = options?.text ?? '';
					for (const [key, value] of Object.entries(options?.attr ?? {})) {
						child.setAttribute(key, value);
					}
					element.append(child);
					return child;
				},
				createSpan: (options: { cls: string; text: string }) => {
					const child = document.createElement('span');
					child.className = options.cls;
					child.textContent = options.text;
					element.append(child);
					return child;
				},
			});
		}

		function createView(headingFolding = true, noteFolding = true) {
			const controller = Object.assign(new Component(), {
				app: {},
				config: {
					get: (key: string) => {
						if (key === ENABLE_HEADING_FOLDING_OPTION_KEY) {
							return headingFolding;
						}
						if (key === ENABLE_NOTE_FOLDING_OPTION_KEY) {
							return noteFolding;
						}
						return undefined;
					},
				},
				data: {},
			});
			const parent = Object.assign(document.createElement('div'), {
				createDiv: () => document.createElement('div'),
			});
			return new FreeformView(controller, parent);
		}

		it('collapses a heading section without hiding the next heading', () => {
			const view = createView();
			const entryEl = document.createElement('div');
			const contentEl = document.createElement('div');
			entryEl.append(contentEl);
			const firstHeading = document.createElement('h2');
			const firstParagraph = document.createElement('p');
			const secondHeading = document.createElement('h2');
			const secondParagraph = document.createElement('p');
			firstHeading.textContent = 'First';
			firstParagraph.textContent = 'First body';
			secondHeading.textContent = 'Second';
			secondParagraph.textContent = 'Second body';
			contentEl.append(
				firstHeading,
				firstParagraph,
				secondHeading,
				secondParagraph,
			);
			addCreateEl(entryEl);
			addCreateEl(firstHeading);
			addCreateEl(secondHeading);

			view['addFoldingControls'](entryEl, contentEl);

			firstHeading
				.querySelector<HTMLButtonElement>('.mark-base-freeform__heading-fold-button')
				?.click();

			expect(firstHeading.textContent).toBe('First');
			expect(firstHeading.querySelector('svg')?.getAttribute('data-icon')).toBe('chevron-right');
			expect(firstParagraph.hidden).toBe(true);
			expect(secondHeading.hidden).toBe(false);
			expect(secondParagraph.hidden).toBe(false);
		});

		it('collapses and expands an entire note', () => {
			const view = createView();
			const entryEl = document.createElement('div');
			entryEl.setAttribute('data-mark-base-source-path', 'Folder/My note.md');
			const contentEl = document.createElement('div');
			const paragraph = document.createElement('p');
			paragraph.textContent = 'Note body';
			contentEl.append(paragraph);
			entryEl.append(contentEl);
			addCreateEl(entryEl);

			view['addFoldingControls'](entryEl, contentEl);

			const noteButton = entryEl.querySelector<HTMLButtonElement>(
				'.mark-base-freeform__note-fold-button',
			);
			noteButton?.click();
			expect(contentEl.hidden).toBe(true);
			expect(noteButton?.textContent).toBe('');
			expect(noteButton?.getAttribute('aria-label')).toBe('Expand note: My note');
			expect(noteButton?.getAttribute('aria-expanded')).toBe('false');
			expect(noteButton?.classList.contains('is-collapsed')).toBe(true);
			const summary = entryEl.querySelector<HTMLElement>('.mark-base-freeform__folded-note-label');
			expect(summary?.textContent).toBe('My note');
			expect(summary?.hidden).toBe(false);

			noteButton?.click();
			expect(contentEl.hidden).toBe(false);
			expect(noteButton?.getAttribute('aria-label')).toBe('Collapse note: My note');
			expect(noteButton?.getAttribute('aria-expanded')).toBe('true');
			expect(summary?.hidden).toBe(true);
		});

		function createContent(markup: string) {
			const entryEl = document.createElement('div');
			const contentEl = document.createElement('div');
			const parsed = new DOMParser().parseFromString(markup, 'text/html');
			contentEl.replaceChildren(...Array.from(parsed.body.childNodes));
			entryEl.append(contentEl);
			addCreateEl(entryEl);
			for (const heading of Array.from(contentEl.querySelectorAll<HTMLElement>('h1, h2, h3'))) {
				addCreateEl(heading);
			}
			return { entryEl, contentEl };
		}

		it('keeps nested sections folded after their parent and note expand', () => {
			const { entryEl, contentEl } = createContent(
				'<h1>Parent</h1><p>Intro</p><h2>Child</h2><p>Child body</p><h1>Next</h1><p>Next body</p>',
			);
			createView()['addFoldingControls'](entryEl, contentEl);
			const buttons = contentEl.querySelectorAll<HTMLButtonElement>('.mark-base-freeform__heading-fold-button');
			const blocks = contentEl.children;
			buttons[1]?.click();
			buttons[0]?.click();
			expect((blocks[2] as HTMLElement).hidden).toBe(true);
			expect((blocks[4] as HTMLElement).hidden).toBe(false);
			buttons[0]?.click();
			expect((blocks[2] as HTMLElement).hidden).toBe(false);
			expect((blocks[3] as HTMLElement).hidden).toBe(true);
			const noteButton = entryEl.querySelector<HTMLButtonElement>('.mark-base-freeform__note-fold-button');
			noteButton?.click();
			noteButton?.click();
			expect((blocks[3] as HTMLElement).hidden).toBe(true);
			buttons[1]?.click();
			expect((blocks[3] as HTMLElement).hidden).toBe(false);
		});

		it('folds editable preview headings across property wrappers without starting editing', () => {
			const { entryEl, contentEl } = createContent(
				'<h1>Property heading</h1><div class="mark-base-freeform__contents"><div class="mark-base-freeform__contents-block"><h2>Body heading</h2><p>Body</p></div></div><h1>Next property</h1><p>Next body</p>',
			);
			const editClick = vi.fn();
			contentEl.querySelector('.mark-base-freeform__contents-block')?.addEventListener('click', editClick);
			createView()['addFoldingControls'](entryEl, contentEl);
			const headings = contentEl.querySelectorAll('h1, h2');
			headings[1]?.querySelector<HTMLButtonElement>('button')?.click();
			const paragraph = contentEl.querySelector('p');
			expect(paragraph?.hidden).toBe(true);
			expect(editClick).not.toHaveBeenCalled();
			headings[0]?.querySelector<HTMLButtonElement>('button')?.click();
			expect((headings[1] as HTMLElement).hidden).toBe(true);
			expect((headings[2] as HTMLElement).hidden).toBe(false);
			const wrapper = contentEl.querySelector<HTMLElement>('.mark-base-freeform__contents');
			expect(wrapper?.hidden).toBe(true);
			headings[0]?.querySelector<HTMLButtonElement>('button')?.click();
			expect(wrapper?.hidden).toBe(false);
			expect(paragraph?.hidden).toBe(true);
		});

		it('restores controls after editable preview replacement without duplicates', () => {
			const { entryEl, contentEl } = createContent(
				'<h1>Property</h1><p>Property body</p><div class="mark-base-freeform__contents-block"><h2>Old heading</h2><p>Old body</p></div>',
			);
			const folding = new FreeformFolding(entryEl, contentEl, true, true);
			const wrapper = contentEl.querySelector<HTMLElement>('.mark-base-freeform__contents-block');
			if (!wrapper) {
				throw new Error('Missing preview wrapper');
			}
			const parsed = new DOMParser().parseFromString('<h2>New heading</h2><p>New body</p>', 'text/html');
			wrapper.replaceChildren(...Array.from(parsed.body.childNodes));
			const newHeading = wrapper.querySelector<HTMLElement>('h2');
			if (!newHeading) {
				throw new Error('Missing preview heading');
			}
			addCreateEl(newHeading);
			folding.refreshHeadings();
			folding.refreshHeadings();
			expect(entryEl.querySelectorAll('.mark-base-freeform__note-fold-button')).toHaveLength(1);
			expect(contentEl.querySelectorAll('.mark-base-freeform__heading-fold-button')).toHaveLength(2);
			newHeading.querySelector<HTMLButtonElement>('button')?.click();
			expect(wrapper.querySelector('p')?.hidden).toBe(true);
		});

		it('does not fold embed headings or add controls to empty sections', () => {
			const { entryEl, contentEl } = createContent(
				'<h1>Empty</h1><h1>Section</h1><div class="internal-embed"><h2>Embedded</h2><p>Body</p></div><h1>Final empty</h1>',
			);
			createView()['addFoldingControls'](entryEl, contentEl);
			expect(contentEl.querySelectorAll('.mark-base-freeform__heading-fold-button')).toHaveLength(1);
			expect(contentEl.querySelector('.internal-embed button')).toBeNull();
		});

		it.each([
			{ headingFolding: false, noteFolding: false },
			{ headingFolding: true, noteFolding: false },
			{ headingFolding: false, noteFolding: true },
		])('respects independent folding settings: $headingFolding, $noteFolding', ({ headingFolding, noteFolding }) => {
			const { entryEl, contentEl } = createContent('<h1>Heading</h1><p>Body</p>');
			createView(headingFolding, noteFolding)['addFoldingControls'](entryEl, contentEl);
			expect(entryEl.querySelectorAll('.mark-base-freeform__heading-fold-button')).toHaveLength(headingFolding ? 1 : 0);
			expect(entryEl.querySelectorAll('.mark-base-freeform__note-fold-button')).toHaveLength(noteFolding ? 1 : 0);
		});
	});

	async function renderView() {
		const root = document.createElement('div');
		const parent = Object.assign(document.createElement('div'), {
			createDiv: () => root,
		});
		const controller = Object.assign(new Component(), {
			app: {},
			config: {
				get: (key: string) => fixtures.settings.get(key),
				getOrder: () => ['note.title'],
				getDisplayName: () => 'Title',
			},
			data: {
				data: fixtures.entries,
				groupedData: fixtures.groups,
				properties: ['note.title'],
			},
		});
		const view = new FreeformView(controller, parent);
		const createOutputPreview = vi.fn<FreeformView['createOutputPreview']>(
			() => document.createElement('div'),
		);
		const renderOrderedEntry = vi.fn<FreeformView['renderOrderedEntry']>(
			async () => {},
		);
		const renderSeparator = vi.fn<FreeformView['renderSeparator']>(
			async () => {},
		);
		view['resetSurface'] = vi.fn();
		view['createOutputPreview'] = createOutputPreview;
		view['renderOrderedEntry'] = renderOrderedEntry;
		view['renderSeparator'] = renderSeparator;

		await view['render'](0);

		return { createOutputPreview, renderOrderedEntry, renderSeparator, root };
	}

	it.each([
		{ exportEnabled: false, separateFiles: false, grouped: true },
		{ exportEnabled: false, separateFiles: true, grouped: true },
		{ exportEnabled: true, separateFiles: false, grouped: false },
		{ exportEnabled: true, separateFiles: true, grouped: true },
	])(
		'shows groups=$grouped with export=$exportEnabled and separate files=$separateFiles',
		async ({ exportEnabled, separateFiles, grouped }) => {
			fixtures.settings.set(SHOW_EXPORT_BUTTON_OPTION_KEY, exportEnabled);
			fixtures.settings.set(
				GROUP_BY_CREATES_SEPARATE_OUTPUT_FILES_OPTION_KEY,
				separateFiles,
			);

			const result = await renderView();

			expect(result.createOutputPreview).toHaveBeenCalledTimes(grouped ? 2 : 0);
			expect(result.renderOrderedEntry).toHaveBeenCalledTimes(2);
			expect(result.renderSeparator).toHaveBeenCalledTimes(grouped ? 0 : 1);
			if (grouped) {
				expect(result.createOutputPreview.mock.calls).toEqual([
					['Title', 'First', 'First.md'],
					['Title', 'Second', 'Second.md'],
				]);
			} else {
				expect(result.renderOrderedEntry.mock.calls[0]?.[3]).toBe(result.root);
			}
		},
	);

	it('does not add group headers when the Base has no group key', async () => {
		for (const group of fixtures.groups) {
			group.hasKey = () => false;
		}

		const result = await renderView();

		expect(result.createOutputPreview).not.toHaveBeenCalled();
		expect(result.renderOrderedEntry).toHaveBeenCalledTimes(2);
		expect(result.renderSeparator).toHaveBeenCalledOnce();
	});
});
