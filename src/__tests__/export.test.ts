import { describe, expect, it } from 'vitest';
import {
	getExportFileName,
	getExportPath,
	transformExportMarkdown,
} from '../freeform/export';

const DEFAULT_OPTIONS = {
	stripYamlFrontmatter: false,
	stripComments: false,
	trimWhitespace: false,
	stripLinks: false,
};

describe('transformExportMarkdown', () => {
	it('preserves Markdown when every transform is disabled', () => {
		const markdown = '---\ntitle: Draft\n---\n\n[Body](Note) %%comment%% ';

		expect(transformExportMarkdown(markdown, DEFAULT_OPTIONS)).toBe(markdown);
	});

	it('strips leading YAML frontmatter', () => {
		expect(
			transformExportMarkdown('---\ntitle: Draft\n---\n\n# Body', {
				...DEFAULT_OPTIONS,
				stripYamlFrontmatter: true,
			}),
		).toBe('\n# Body');
	});

	it('removes every line touched by Obsidian and HTML comments', () => {
		expect(
			transformExportMarkdown(
				[
					'Keep before',
					'Before %%private',
					'note%% after',
					'Keep middle',
					'Before <!-- hidden --> after',
					'Keep after',
				].join('\n'),
				{ ...DEFAULT_OPTIONS, stripComments: true },
			),
		).toBe('Keep before\nKeep middle\nKeep after');
	});

	it('does not leave a blank line for a standalone comment', () => {
		expect(
			transformExportMarkdown('Before\n%% hidden %%\nAfter', {
				...DEFAULT_OPTIONS,
				stripComments: true,
			}),
		).toBe('Before\nAfter');
	});

	it('keeps labels while stripping common link markup', () => {
		const markdown = [
			'[[People/Ada|Ada]] and [[Grace Hopper]]',
			'[site](https://example.com) and ![diagram](diagram.png)',
			'<a class="internal-link" href="Note">Title</a>',
		].join('\n');

		expect(
			transformExportMarkdown(markdown, {
				...DEFAULT_OPTIONS,
				stripLinks: true,
			}),
		).toBe('Ada and Grace Hopper\nsite and diagram\nTitle');
	});

	it('trims outer whitespace after applying other transforms', () => {
		expect(
			transformExportMarkdown('  %% hidden %%\nBody\n ', {
				...DEFAULT_OPTIONS,
				stripComments: true,
				trimWhitespace: true,
			}),
		).toBe('Body');
	});

	it('preserves whitespace at entry boundaries when requested', () => {
		const options = { ...DEFAULT_OPTIONS, trimWhitespace: true };

		expect(
			transformExportMarkdown('\n\n# Chapter\n', options, {
				trimStart: false,
				trimEnd: true,
			}),
		).toBe('\n\n# Chapter');
		expect(
			transformExportMarkdown('Scene\n\n', options, {
				trimStart: true,
				trimEnd: false,
			}),
		).toBe('Scene\n\n');
	});
});

describe('export destinations', () => {
	it('normalizes Markdown filenames and optional group suffixes', () => {
		expect(getExportFileName('draft')).toBe('draft.md');
		expect(getExportFileName('draft.MD')).toBe('draft.md');
		expect(getExportFileName('draft.md', 'Status: In progress')).toBe(
			'draft-Status- In progress.md',
		);
		expect(getExportFileName('../draft.md', '')).toBe(
			'..-draft-Ungrouped.md',
		);
	});

	it('joins normalized vault folders and files', () => {
		expect(getExportPath('', 'export.md')).toBe('export.md');
		expect(getExportPath('/Exports\\Drafts/', 'export.md')).toBe(
			'Exports/Drafts/export.md',
		);
	});
});