import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryController } from 'obsidian';
import {
	FreeformView,
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

	async function renderView() {
		const root = document.createElement('div');
		const parent = Object.assign(document.createElement('div'), {
			createDiv: () => root,
		});
		const controller = {
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
		} as QueryController;
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
