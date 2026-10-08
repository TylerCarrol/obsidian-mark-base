import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	Component, ListValue, MarkdownRenderer, StringValue, TFile,
	type BasesEntry, type BasesPropertyId, type CachedMetadata,
} from 'obsidian';
import { EntryPropertyResolver } from '../freeform/entry-property-resolver';
import { ExcerptMetadata } from '../freeform/excerpt-metadata';
import { FreeformView, ENABLE_FILE_CONTENTS_EDITING_OPTION_KEY } from '../freeform/view';
import { buildOrderedEntryMarkdown } from '../freeform/content';
import { type ExportOptions } from '../freeform/export';
import * as regexWorker from '../freeform/excerpt-regex';

function fixture(content = '---\ntitle: Note\n---\n\n# Heading\nSelected [[Target]]\\n\nUnselected') {
	const file = Object.assign(new TFile(), { path: 'Notes/Note.md' });
	const values = new Map<BasesPropertyId, ListValue | StringValue>([
		['formula.Excerpt', new ListValue(['markbase.contents', 'lines', 3, 3])],
		['formula.Other', new ListValue(['markbase.contents', 'lines', 2, 2])],
		['formula.Plain', new StringValue('plain\\ntext')],
	]);
	const entry: BasesEntry = { file, getValue: (id) => values.get(id) ?? null };
	const cachedRead = vi.fn(async () => content);
	const getFileCache = vi.fn((): CachedMetadata | null => ({}));
	const app = { vault: { cachedRead }, metadataCache: { getFileCache } };
	const metadata = new ExcerptMetadata();
	const controller = new AbortController();
	const resolver = new EntryPropertyResolver(app, entry, metadata, controller.signal, false);
	return { app, entry, values, cachedRead, getFileCache, metadata, controller, resolver };
}

function surface(): HTMLElement {
	const element = document.createElement('div');
	Object.assign(element, {
		createDiv: (options?: { cls?: string | string[]; attr?: Record<string, string> }) => {
			const child = surface();
			child.className = Array.isArray(options?.cls) ? options.cls.join(' ') : options?.cls ?? '';
			for (const [name, value] of Object.entries(options?.attr ?? {})) {
				child.setAttribute(name, value);
			}
			element.append(child);
			return child;
		},
	});
	return element;
}

const options: ExportOptions = {
	folder: '', file: 'export.md', type: 'markdown',
	groupByCreatesSeparateOutputFiles: false, openFileAfterExport: false,
	stripYamlFrontmatter: false, stripComments: false, trimWhitespace: false, stripLinks: false,
};

function viewFixture(editable = false) {
	const data = fixture();
	const root = surface();
	const controller = Object.assign(new Component(), {
		app: data.app,
		config: { get: (key: string) => key === ENABLE_FILE_CONTENTS_EDITING_OPTION_KEY && editable },
		data: { data: [data.entry] },
	});
	const view = new FreeformView(controller, Object.assign(surface(), { createDiv: () => root }));
	view['addFoldingControls'] = vi.fn();
	view['renderLeadingNewlines'] = vi.fn();
	return { ...data, root, view };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('entry excerpt resolver', () => {
	it('shares one lazy source read across selectors, repeated formulas, and full contents', async () => {
		const data = fixture();
		await expect(data.resolver.resolve('formula.Plain')).resolves.toBe('plain\ntext');
		expect(data.cachedRead).not.toHaveBeenCalled();
		const first = data.resolver.resolve('formula.Excerpt');
		expect(data.resolver.resolve('formula.Excerpt')).toBe(first);
		await expect(first).resolves.toBe('Selected [[Target]]\\n');
		await data.resolver.resolve('formula.Other');
		await data.resolver.resolve('file.contents');
		expect(data.cachedRead).toHaveBeenCalledOnce();
		expect(data.getFileCache).not.toHaveBeenCalled();
	});

	it('preserves extracted backslash-n while ordinary formula text still expands', async () => {
		const data = fixture();
		const resolved = await data.resolver.resolveOrdered(['formula.Excerpt', 'formula.Plain']);
		expect(buildOrderedEntryMarkdown(resolved, data.entry.file.path, '\n')).toBe('Selected [[Target]]\\n\nplain\ntext');
	});

	it('does not interpret instruction lists in note properties', async () => {
		const data = fixture();
		data.values.set('note.instruction', new ListValue(['markbase.contents', 'lines', 1]));
		await expect(data.resolver.resolve('note.instruction')).resolves.toContain('markbase.contents');
		expect(data.cachedRead).not.toHaveBeenCalled();
	});

	it('reports the formula and source path on malformed instructions', async () => {
		const data = fixture();
		data.values.set('formula.Excerpt', new ListValue(['markbase.contents', 'lines', 0]));
		await expect(data.resolver.resolve('formula.Excerpt')).rejects.toThrow('formula.Excerpt in "Notes/Note.md"');
		expect(data.cachedRead).not.toHaveBeenCalled();
	});

	it('uses matching metadata snapshots and rejects stale metadata after modifications', async () => {
		const content = 'Text #todo/work\nOther';
		const data = fixture(content);
		const cache: CachedMetadata = {
			tags: [{ tag: '#todo/work', position: {
				start: { line: 0, col: 5, offset: 5 }, end: { line: 0, col: 15, offset: 15 },
			} }],
		};
		data.values.set('formula.Excerpt', new ListValue(['markbase.contents', 'tag', '#todo', 'lines']));
		data.metadata.modified(data.entry.file);
		await expect(data.resolver.resolve('formula.Excerpt')).rejects.toThrow('out of date');
		data.metadata.changed(data.entry.file, content, cache);
		const fresh = new EntryPropertyResolver(data.app, data.entry, data.metadata, data.controller.signal, false);
		await expect(fresh.resolve('formula.Excerpt')).resolves.toBe('Text #todo/work');
		expect(data.getFileCache).not.toHaveBeenCalled();
		expect(data.metadata.isRequested(data.entry.file)).toBe(true);
		data.metadata.modified(data.entry.file);
		expect(data.metadata.get(data.entry.file, content, data.app.metadataCache)).toBe(cache);
		expect(() => data.metadata.get(data.entry.file, 'new text', data.app.metadataCache)).toThrow('out of date');
	});

	it('reports unavailable metadata and cancelled reads', async () => {
		const data = fixture();
		data.values.set('formula.Excerpt', new ListValue(['markbase.contents', 'tag', '#todo', 'lines']));
		data.getFileCache.mockReturnValueOnce(null);
		await expect(data.resolver.resolve('formula.Excerpt')).rejects.toThrow('metadata is unavailable');
		const pending = fixture();
		const read = pending.resolver.readSource();
		pending.controller.abort();
		await expect(read).rejects.toThrow('cancelled');
	});

	it('forgets snapshots and pending metadata for notes removed from the query', () => {
		const data = fixture();
		data.metadata.get(data.entry.file, 'old', data.app.metadataCache);
		data.metadata.changed(data.entry.file, 'old', {});
		data.metadata.modified(data.entry.file);
		data.metadata.retain([]);
		expect(data.metadata.isRequested(data.entry.file)).toBe(false);
		expect(data.metadata.get(data.entry.file, 'new', data.app.metadataCache)).toEqual({});
	});

	it.each(['lines', 'blocks'] as const)('passes complete %s to regex selection', async (mode) => {
		const data = fixture('A\nDecision\nend\n\nOther');
		const match = vi.spyOn(regexWorker, 'matchExcerptRegex').mockResolvedValue([0]);
		data.values.set('formula.Excerpt', new ListValue(['markbase.contents', 'regex', 'decision', mode, 'im']));
		data.getFileCache.mockReturnValue({
			sections: [
				{ type: 'paragraph', position: {
					start: { offset: 0, line: 0, col: 0 }, end: { offset: 14, line: 2, col: 3 },
				} },
				{ type: 'paragraph', position: {
					start: { offset: 16, line: 4, col: 0 }, end: { offset: 21, line: 4, col: 5 },
				} },
			],
		});
		await expect(data.resolver.resolve('formula.Excerpt')).resolves.toBe(mode === 'blocks' ? 'A\nDecision\nend' : 'A');
		expect(match.mock.calls[0]?.[0]).toEqual(mode === 'blocks'
			? ['A\nDecision\nend', 'Other']
			: ['A', 'Decision', 'end', '', 'Other']);
		expect(match.mock.calls[0]?.slice(1, 3)).toEqual(['decision', 'im']);
	});
});

describe('excerpt view integration', () => {
	it.each([null, '{{formula.Excerpt}}\n{{formula.Other}}'])('matches preview and export output with template %j', async (template) => {
		const { view, entry, root, cachedRead } = viewFixture();
		const render = vi.spyOn(MarkdownRenderer, 'render').mockResolvedValue();
		const order: BasesPropertyId[] = ['formula.Excerpt', 'formula.Other'];
		if (template === null) {
			await view['renderOrderedEntry'](order, entry, new Component(), root, options, true, true);
		} else {
			await view['renderTemplateEntry'](template, entry, new Component(), root, options, true, true);
		}
		const preview = render.mock.calls[0]?.[1];
		const exported = await view['buildEntryExportMarkdown'](entry, template, order, options, false);
		expect(preview).toBe('Selected [[Target]]\\n\n# Heading');
		expect(exported).toBe(preview);
		expect(render.mock.calls[0]?.[3]).toBe('Notes/Note.md');
		expect(cachedRead).toHaveBeenCalledTimes(2);
	});

	it('renders formula excerpts read-only beside the full-body editor with one source read', async () => {
		const { view, entry, root, cachedRead } = viewFixture(true);
		const render = vi.spyOn(MarkdownRenderer, 'render').mockResolvedValue();
		const editor = vi.fn<FreeformView['renderEditableFileContents']>().mockResolvedValue();
		view['renderEditableFileContents'] = editor;
		await view['renderOrderedEntry'](['formula.Excerpt', 'file.contents'], entry, new Component(), root, options, true, true);
		expect(render.mock.calls[0]?.[1]).toBe('Selected [[Target]]\\n');
		expect(editor).toHaveBeenCalledOnce();
		expect(editor.mock.calls[0]?.[1]).toContain('Unselected');
		expect(cachedRead).toHaveBeenCalledOnce();
	});

	it('resolves excerpts before export cleanup and trimming', async () => {
		const { view, entry } = viewFixture();
		const output = await view['buildEntryExportMarkdown'](
			entry, null, ['formula.Excerpt'], { ...options, stripLinks: true, trimWhitespace: true }, true,
		);
		expect(output).toBe('Selected Target\\n');
	});

	it('stops an export on selector errors without creating any files', async () => {
		const { view, entry, values, app } = viewFixture();
		const create = vi.fn();
		Object.assign(app.vault, { create });
		view['readTemplate'] = vi.fn(async () => null);
		view['getPropertyOrder'] = vi.fn<FreeformView['getPropertyOrder']>(() => ['formula.Excerpt']);
		Object.assign(view.data, { data: [entry], groupedData: [] });
		values.set('formula.Excerpt', new ListValue(['markbase.contents', 'lines', 0]));
		await expect(view['exportMarkdown'](options)).rejects.toThrow('positive integer');
		expect(create).not.toHaveBeenCalled();
		expect(view['exportAborts'].size).toBe(0);
	});

	it('cleans up cancelled previews and exports on unload', () => {
		const { view } = viewFixture();
		const signal = view['renderAbort'].signal;
		const exporting = new AbortController();
		view['exportAborts'].add(exporting);
		view.onunload();
		expect(signal.aborted).toBe(true);
		expect(exporting.signal.aborted).toBe(true);
	});

	it('registers metadata refresh and rerenders only notes that require it', async () => {
		const { view, entry, app, values } = viewFixture();
		const request = vi.fn();
		view['requestRender'] = request;
		let modified: ((file: TFile) => void) | undefined;
		let changed: ((file: TFile, content: string, cache: CachedMetadata) => void) | undefined;
		Object.assign(app.vault, {
			on: (_name: string, callback: (file: TFile) => void) => { modified = callback; return {}; },
		});
		Object.assign(app.metadataCache, {
			on: (_name: string, callback: (file: TFile, content: string, cache: CachedMetadata) => void) => { changed = callback; return {}; },
		});
		view.onload();
		expect(request).toHaveBeenCalledOnce();
		changed?.(entry.file, 'fresh', {});
		expect(request).toHaveBeenCalledOnce();
		values.set('formula.Excerpt', new ListValue(['markbase.contents', 'tag', 'todo', 'lines']));
		modified?.(entry.file);
		await expect(view['createPropertyResolver'](entry, false).resolve('formula.Excerpt')).rejects.toThrow('out of date');
		changed?.(entry.file, 'fresh', {});
		expect(request).toHaveBeenCalledTimes(3);
	});

	it('resolves excerpt formulas in each grouped preview and export', async () => {
		const { view, entry, root } = viewFixture();
		const render = vi.spyOn(MarkdownRenderer, 'render').mockResolvedValue();
		view['resetSurface'] = vi.fn();
		view['getPropertyOrder'] = vi.fn<FreeformView['getPropertyOrder']>(() => ['formula.Excerpt']);
		view['getGroupPropertyLabel'] = vi.fn(() => 'Group');
		view['createOutputPreview'] = vi.fn(() => root);
		Object.assign(view.data, {
			groupedData: [
				{ entries: [entry], key: 'Group A', hasKey: () => true },
				{ entries: [entry], key: 'Group B', hasKey: () => true },
			],
		});
		await view['render'](0);
		expect(render.mock.calls.map((call) => call[1])).toEqual(['Selected [[Target]]\\n', 'Selected [[Target]]\\n']);
		for (const group of view.data.groupedData) {
			await expect(view['buildExportMarkdown'](group.entries, null, ['formula.Excerpt'], options)).resolves.toBe('Selected [[Target]]\\n');
		}
	});
});
