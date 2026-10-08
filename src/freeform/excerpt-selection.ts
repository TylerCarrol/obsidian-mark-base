import type { CachedMetadata } from 'obsidian';
import { extractMarkdownBody } from './content';

export interface SourceRange {
	start: number;
	end: number;
}

export interface ExcerptSource {
	content: string;
	body: string;
	bodyOffset: number;
	lines: SourceRange[];
}

export function createExcerptSource(content: string): ExcerptSource {
	const body = extractMarkdownBody(content);
	const lines: SourceRange[] = [];
	const pattern = /([^\r\n]*)(?:\r?\n|$)/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(body)) && match[0].length > 0) {
		lines.push({ start: match.index, end: match.index + (match[1]?.length ?? 0) });
	}
	return { content, body, bodyOffset: content.length - body.length, lines };
}

export function selectLineRange(source: ExcerptSource, start: number, end?: number): string {
	const first = source.lines[start - 1];
	const last = source.lines[Math.min(end ?? source.lines.length, source.lines.length) - 1];
	return first && last ? source.body.slice(first.start, last.end) : '';
}

export function getExcerptBlocks(source: ExcerptSource, metadata: CachedMetadata): SourceRange[] {
	if (!metadata.sections && source.body.trim()) {
		throw new Error('Markdown block metadata is unavailable. Wait for Obsidian to index the note.');
	}
	return (metadata.sections ?? [])
		.filter((section) => section.type !== 'yaml')
		.map((section) => ({
			start: section.position.start.offset - source.bodyOffset,
			end: section.position.end.offset - source.bodyOffset,
		}))
		.filter((range) => range.start >= 0)
		.map((range) => {
			if (range.end < range.start || range.end > source.body.length) {
				throw new Error('Markdown block metadata is out of date. Wait for Obsidian to index the note.');
			}
			return range;
		})
		.sort((a, b) => a.start - b.start);
}

export function selectTaggedRanges(
	source: ExcerptSource,
	metadata: CachedMetadata,
	tag: string,
	ranges: SourceRange[],
): SourceRange[] {
	const matchingOffsets = (metadata.tags ?? [])
		.filter((item) => {
			const name = item.tag.replace(/^#/, '').toLowerCase();
			return name === tag || name.startsWith(`${tag}/`);
		})
		.map((item) => {
			const start = item.position.start.offset;
			const end = item.position.end.offset;
			if (source.content.slice(start, end) !== item.tag) {
				throw new Error('Tag metadata is out of date. Wait for Obsidian to index the note.');
			}
			return start - source.bodyOffset;
		})
		.filter((offset) => offset >= 0);
	return ranges.filter((range) =>
		matchingOffsets.some((offset) => offset >= range.start && offset < range.end),
	);
}

export function joinExcerptRanges(
	source: ExcerptSource,
	ranges: SourceRange[],
	separator: string,
): string {
	let result = '';
	let previous: SourceRange | undefined;
	for (const range of ranges) {
		if (previous && (range.start < previous.end || range.start === previous.start)) {
			continue;
		}
		if (previous) {
			const gap = source.body.slice(previous.end, range.start);
			result += /^\r?\n$/.test(gap) || (separator === '\n\n' && /^\s*$/.test(gap))
				? gap
				: separator;
		}
		result += source.body.slice(range.start, range.end);
		previous = range;
	}
	return result;
}
