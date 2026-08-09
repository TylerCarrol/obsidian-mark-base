import { describe, expect, it } from 'vitest';
import {
	buildOrderedEntryMarkdown,
	escapeLeadingFrontmatter,
	expandEscapedNewlines,
	getInternalLinkTarget,
	resolvePropertyOrder,
	SOURCE_PATH_ATTRIBUTE,
} from '../freeform/content';

describe('expandEscapedNewlines', () => {
	it('expands escaped and preserves actual newlines', () => {
		expect(expandEscapedNewlines(String.raw`---\nNext`)).toBe(
			'---\nNext',
		);
		expect(expandEscapedNewlines('---\nNext')).toBe('---\nNext');
	});
});

describe('buildOrderedEntryMarkdown', () => {
	it('joins non-empty property markdown with the configured separator', () => {
		expect(
			buildOrderedEntryMarkdown(
				[
					{ propertyId: 'formula.title', value: '# Ada' },
					{ propertyId: 'formula.summary', value: '' },
					{ propertyId: 'formula.quote', value: '> Quote' },
				],
				'People/Ada Lovelace.md',
				'\n\n',
			),
		).toBe('# Ada\n\n> Quote');
	});

	it('renders file.name as an internal link inside the markdown document', () => {
		expect(
			buildOrderedEntryMarkdown(
				[{ propertyId: 'file.name', value: 'Ada <Lovelace>' }],
				'People/Ada Lovelace.md',
				'\n',
			),
		).toBe(
			'<a class="internal-link" data-href="People/Ada Lovelace.md" href="People/Ada Lovelace.md">Ada &lt;Lovelace&gt;</a>',
		);
	});
});

describe('escapeLeadingFrontmatter', () => {
	it('escapes a multiline separator that resembles frontmatter', () => {
		expect(
			escapeLeadingFrontmatter(
				expandEscapedNewlines(String.raw`---\n---`),
			),
		).toBe('\n---\n---');
	});

	it('preserves Markdown without a frontmatter opening', () => {
		expect(escapeLeadingFrontmatter('---')).toBe('---');
		expect(escapeLeadingFrontmatter('***\n***')).toBe('***\n***');
	});
});

describe('resolvePropertyOrder', () => {
	it('uses the configured property order when present', () => {
		expect(
			resolvePropertyOrder(
				['formula.summary', 'note.title'],
				['note.title', 'file.name'],
			),
		).toEqual(['formula.summary', 'note.title']);
	});

	it('falls back to the available properties', () => {
		expect(
			resolvePropertyOrder([], ['file.name', 'note.title']),
		).toEqual(['file.name', 'note.title']);
	});
});

describe('getInternalLinkTarget', () => {
	it('reads the rendered link and its entry source path', () => {
		const entryEl = document.createElement('div');
		entryEl.setAttribute(SOURCE_PATH_ATTRIBUTE, 'People/Ada.md');
		const linkEl = entryEl.appendChild(document.createElement('a'));
		linkEl.dataset.href = 'Notes/Target';
		linkEl.href = 'Notes/Fallback';

		expect(getInternalLinkTarget(linkEl)).toEqual({
			linktext: 'Notes/Target',
			sourcePath: 'People/Ada.md',
		});
	});

	it('falls back to href and rejects links without a destination', () => {
		const linkEl = document.createElement('a');
		linkEl.setAttribute('href', 'Notes/Target');
		expect(getInternalLinkTarget(linkEl)).toEqual({
			linktext: 'Notes/Target',
			sourcePath: '',
		});

		linkEl.removeAttribute('href');
		expect(getInternalLinkTarget(linkEl)).toBeNull();
	});
});
