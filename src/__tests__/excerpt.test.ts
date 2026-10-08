import { describe, expect, it } from 'vitest';
import { ListValue, type CachedMetadata, type CacheItem } from 'obsidian';
import { decodeExcerptInstruction } from '../freeform/excerpt-instruction';
import {
	createExcerptSource,
	getExcerptBlocks,
	joinExcerptRanges,
	selectLineRange,
	selectTaggedRanges,
} from '../freeform/excerpt-selection';

export function position(content: string, text: string): CacheItem['position'] {
	const start = content.indexOf(text);
	if (start < 0) {
		throw new Error(`Missing fixture text: ${text}`);
	}
	return {
		start: { offset: start, line: content.slice(0, start).split('\n').length - 1, col: 0 },
		end: { offset: start + text.length, line: content.slice(0, start + text.length).split('\n').length - 1, col: 0 },
	};
}

describe('excerpt instructions', () => {
	it.each([
		[['lines', 10, 20], { selector: 'lines', start: 10, end: 20 }],
		[['lines', 1], { selector: 'lines', start: 1 }],
		[['tag', '#ToDo', 'blocks'], { selector: 'tag', tag: 'todo', mode: 'blocks' }],
		[['regex', '^task', 'lines', 'im'], { selector: 'regex', pattern: '^task', mode: 'lines', flags: 'im' }],
	])('decodes %j', (args, expected) => {
		expect(decodeExcerptInstruction(new ListValue(['markbase.contents', ...args]))).toEqual(expected);
	});

	it.each([
		[], ['lines'], ['lines', '1'], ['lines', 0], ['lines', 1.5],
		['lines', 2, 1], ['lines', 1, 2, 3], ['lines', Infinity],
		['tag', '', 'lines'], ['tag', '#a b', 'lines'], ['tag', 'a/', 'lines'],
		['tag', 'todo'], ['tag', 'todo', 'sections'],
		['regex', 'a', 'lines', 'g'], ['regex', 'a', 'lines', 'ii'],
		['regex', 1, 'lines'], ['unknown'],
	].map((args) => ({ args })))('rejects a malformed reserved instruction $args', ({ args }) => {
		expect(() => decodeExcerptInstruction(new ListValue(['markbase.contents', ...args]))).toThrow();
	});

	it('leaves ordinary strings and lists alone', () => {
		expect(decodeExcerptInstruction('markbase.contents')).toBeNull();
		expect(decodeExcerptInstruction(new ListValue(['ordinary', 'lines']))).toBeNull();
		expect(decodeExcerptInstruction(new ListValue([]))).toBeNull();
		expect(decodeExcerptInstruction(['markbase.contents', 'lines', 1])).toBeNull();
	});
});

describe('excerpt source selection', () => {
	it.each(['\n', '\r\n'])('counts body lines before trimming with %j newlines', (newline) => {
		const source = createExcerptSource(['---', 'tags: [todo]', '---', '', '  First', '', 'Last', ''].join(newline));
		expect(source.lines).toHaveLength(4);
		expect(selectLineRange(source, 1, 2)).toBe(`${newline}  First`);
		expect(selectLineRange(source, 2, 3)).toBe(`  First${newline}`);
		expect(selectLineRange(source, 2)).toBe(`  First${newline}${newline}Last`);
		expect(selectLineRange(source, 4, 99)).toBe('Last');
		expect(selectLineRange(source, 99)).toBe('');
	});

	it('handles empty bodies and a final unterminated line', () => {
		expect(createExcerptSource('').lines).toEqual([]);
		expect(createExcerptSource('\n').lines).toHaveLength(1);
		expect(selectLineRange(createExcerptSource('one\ntwo'), 2)).toBe('two');
		expect(selectLineRange(createExcerptSource('---\ntitle: A\n---\n'), 1)).toBe('');
	});

	const blocks = [
		['heading', '# Heading #todo'],
		['paragraph', 'A paragraph #todo/work\ncontinues here.'],
		['list', '- one #TODO\n- two'],
		['callout', '> [!note]\n> Callout #todo'],
		['table', '| Task | State |\n| --- | --- |\n| #todo | open |'],
		['code', '```text\n#todo\n```'],
		['paragraph', 'No matching tag #todoish'],
	] as const;
	const content = `---\ntags: [todo]\n---\n\n${blocks.map(([, text]) => text).join('\n\n')}`;
	const metadata: CachedMetadata = {
		sections: [
			{ type: 'yaml', position: position(content, '---\ntags: [todo]\n---') },
			...blocks.map(([type, text]) => ({ type, position: position(content, text) })),
		],
		tags: blocks.filter(([type]) => type !== 'code').map(([, text]) => {
			const tag = text.match(/#[Tt][Oo][Dd][Oo](?:\/work|ish)?/)?.[0];
			if (!tag) { throw new Error('Missing fixture tag'); }
			const blockStart = content.indexOf(text);
			const offset = blockStart + text.indexOf(tag);
			const pos = position(content, text);
			return {
				tag,
				position: {
					start: { ...pos.start, offset },
					end: { ...pos.start, offset: offset + tag.length },
				},
			};
		}),
	};

	it('selects root-level blocks, includes descendants, and excludes code tag lookalikes', () => {
		const source = createExcerptSource(content);
		const ranges = getExcerptBlocks(source, metadata);
		expect(ranges).toHaveLength(blocks.length);
		const selected = selectTaggedRanges(source, metadata, 'todo', ranges);
		expect(joinExcerptRanges(source, selected, '\n\n')).toBe(
			blocks.slice(0, 5).map(([, text]) => text).join('\n\n'),
		);
	});

	it('selects only tagged lines and deduplicates multiple tags', () => {
		const source = createExcerptSource(content);
		const duplicated = { ...metadata, tags: [...(metadata.tags ?? []), ...(metadata.tags ?? [])] };
		const selected = selectTaggedRanges(source, duplicated, 'todo', source.lines);
		const excerpt = joinExcerptRanges(source, selected, '\n');
		expect(excerpt).toBe('# Heading #todo\nA paragraph #todo/work\n- one #TODO\n> Callout #todo\n| #todo | open |');
		expect(excerpt).not.toContain('continues here');
	});

	it('uses metadata rather than frontmatter tags or a whole heading section', () => {
		const source = createExcerptSource(content);
		expect(selectTaggedRanges(source, {}, 'todo', source.lines)).toEqual([]);
		expect(joinExcerptRanges(source, [getExcerptBlocks(source, metadata)[0]!], '\n\n')).toBe('# Heading #todo');
	});

	it('reports missing and stale metadata', () => {
		const source = createExcerptSource(content);
		expect(() => getExcerptBlocks(source, {})).toThrow('metadata is unavailable');
		expect(() => getExcerptBlocks(createExcerptSource('short'), metadata)).toThrow('out of date');
		expect(() => selectTaggedRanges(createExcerptSource(content.replace('#TODO', '#DONE')), metadata, 'todo', source.lines)).toThrow('out of date');
	});

	it('preserves adjacent CRLF lines and literal backslash-n text', () => {
		const source = createExcerptSource('one\\n\r\ntwo\r\nskip\r\nfour');
		expect(joinExcerptRanges(source, source.lines.filter((_line, index) => index !== 2), '\n')).toBe('one\\n\r\ntwo\nfour');
	});
});
