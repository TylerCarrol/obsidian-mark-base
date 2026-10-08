import { ListValue, NumberValue, StringValue } from 'obsidian';

export const EXCERPT_INSTRUCTION = 'markbase.contents';
export type ExcerptMode = 'lines' | 'blocks';
export type ExcerptInstruction =
	| { selector: 'lines'; start: number; end?: number }
	| { selector: 'tag'; tag: string; mode: ExcerptMode }
	| { selector: 'regex'; pattern: string; mode: ExcerptMode; flags: string };

function getString(list: ListValue, index: number): string {
	const value = list.get(index);
	if (!(value instanceof StringValue)) {
		throw new Error(`Argument ${index + 1} must be a string.`);
	}
	return value.toString();
}

function getLine(list: ListValue, index: number): number {
	const value = list.get(index);
	const number = value instanceof NumberValue ? Number(value.toString()) : NaN;
	if (!Number.isSafeInteger(number) || number < 1) {
		throw new Error(`Argument ${index + 1} must be a positive integer.`);
	}
	return number;
}

function getMode(list: ListValue): ExcerptMode {
	const mode = getString(list, 3);
	if (mode !== 'lines' && mode !== 'blocks') {
		throw new Error('The output mode must be "lines" or "blocks".');
	}
	return mode;
}

export function decodeExcerptInstruction(value: unknown): ExcerptInstruction | null {
	if (
		!(value instanceof ListValue) ||
		!(value.get(0) instanceof StringValue) ||
		value.get(0).toString() !== EXCERPT_INSTRUCTION
	) {
		return null;
	}

	const selector = getString(value, 1);
	const length = value.length();
	switch (selector) {
		case 'lines': {
			if (length !== 3 && length !== 4) {
				throw new Error('A line selector needs a start and an optional end.');
			}
			const start = getLine(value, 2);
			const end = length === 4 ? getLine(value, 3) : undefined;
			if (end !== undefined && end < start) {
				throw new Error('The end line must not precede the start line.');
			}
			return { selector, start, end };
		}
		case 'tag': {
			if (length !== 4) {
				throw new Error('A tag selector needs a tag and an output mode.');
			}
			const tag = getString(value, 2).replace(/^#/, '').toLowerCase();
			if (!tag || /[\s#]/.test(tag) || tag.split('/').some((part) => !part)) {
				throw new Error('The tag must be a nonempty tag name, with optional nested segments.');
			}
			return { selector, tag, mode: getMode(value) };
		}
		case 'regex': {
			if (length !== 4 && length !== 5) {
				throw new Error('A regex selector needs a pattern, an output mode, and optional flags.');
			}
			const pattern = getString(value, 2);
			const flags = length === 5 ? getString(value, 4) : '';
			if (!/^[imsu]*$/.test(flags) || new Set(flags).size !== flags.length) {
				throw new Error('Regex flags must be unique and contain only i, m, s, or u.');
			}
			return { selector, pattern, mode: getMode(value), flags };
		}
		default:
			throw new Error(`Unknown contents selector "${selector}".`);
	}
}
