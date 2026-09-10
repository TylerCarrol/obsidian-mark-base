export interface LivePreviewSyntaxRange {
	from: number;
	to: number;
	contentFrom: number;
	contentTo: number;
	className: string;
	hideWhole?: boolean;
	marker?: string;
}

interface DelimitedSyntax {
	pattern: RegExp;
	className: string;
	openingLength: (match: RegExpExecArray) => number;
	closingLength: (match: RegExpExecArray) => number;
}

const DELIMITED_SYNTAX: DelimitedSyntax[] = [
	{
		pattern: /(\*\*|__)(?=\S)([^\n]*?\S)\1/g,
		className: 'mark-base-live-preview__bold',
		openingLength: (match) => match[1]?.length ?? 2,
		closingLength: (match) => match[1]?.length ?? 2,
	},
	{
		pattern: /(?<!\*)\*(?!\*)(?=\S)([^\n]*?\S)\*(?!\*)/g,
		className: 'mark-base-live-preview__italic',
		openingLength: () => 1,
		closingLength: () => 1,
	},
	{
		pattern: /(?<!_)_(?!_)(?=\S)([^\n]*?\S)_(?!_)/g,
		className: 'mark-base-live-preview__italic',
		openingLength: () => 1,
		closingLength: () => 1,
	},
	{
		pattern: /~~(?=\S)([^\n]*?\S)~~/g,
		className: 'mark-base-live-preview__strikethrough',
		openingLength: () => 2,
		closingLength: () => 2,
	},
	{
		pattern: /==(?=\S)([^\n]*?\S)==/g,
		className: 'mark-base-live-preview__highlight',
		openingLength: () => 2,
		closingLength: () => 2,
	},
	{
		pattern: /(?<!`)`([^`\n]+)`(?!`)/g,
		className: 'mark-base-live-preview__code',
		openingLength: () => 1,
		closingLength: () => 1,
	},
	{
		pattern: /(?<!\$)\$(?!\$)([^$\n]+)\$(?!\$)/g,
		className: 'mark-base-live-preview__math',
		openingLength: () => 1,
		closingLength: () => 1,
	},
];

export function findLivePreviewSyntax(markdown: string): LivePreviewSyntaxRange[] {
	const ranges = [
		...findDelimitedSyntax(markdown),
		...findWikiLinks(markdown),
		...findMarkdownLinks(markdown),
		...findComments(markdown),
		...findBlockSyntax(markdown),
		...findTags(markdown),
	];
	const suppressors = ranges.filter(
		(range) =>
			range.hideWhole ||
			range.className === 'mark-base-live-preview__code',
	);

	return ranges.filter(
		(range) =>
			!suppressors.some(
				(suppressor) =>
					suppressor !== range &&
					range.from >= suppressor.contentFrom &&
					range.to <= suppressor.contentTo,
			),
	);
}

function findDelimitedSyntax(markdown: string): LivePreviewSyntaxRange[] {
	const ranges: LivePreviewSyntaxRange[] = [];
	for (const syntax of DELIMITED_SYNTAX) {
		for (const match of markdown.matchAll(syntax.pattern)) {
			const from = match.index;
			const to = from + match[0].length;
			ranges.push({
				from,
				to,
				contentFrom: from + syntax.openingLength(match),
				contentTo: to - syntax.closingLength(match),
				className: syntax.className,
			});
		}
	}
	return ranges;
}

function findWikiLinks(markdown: string): LivePreviewSyntaxRange[] {
	return Array.from(
		markdown.matchAll(/!?\[\[([^\]\n]+)\]\]/g),
		(match): LivePreviewSyntaxRange => {
			const from = match.index;
			const to = from + match[0].length;
			const inner = match[1] ?? '';
			const aliasSeparator = inner.lastIndexOf('|');
			const openingLength = match[0].startsWith('!') ? 3 : 2;
			return {
				from,
				to,
				contentFrom:
					from + openingLength +
					(aliasSeparator >= 0 ? aliasSeparator + 1 : 0),
				contentTo: to - 2,
				className: match[0].startsWith('!')
					? 'mark-base-live-preview__embed'
					: 'mark-base-live-preview__link',
			};
		},
	);
}

function findMarkdownLinks(markdown: string): LivePreviewSyntaxRange[] {
	return Array.from(
		markdown.matchAll(/!?\[([^\]\n]+)\]\(([^)\n]+)\)/g),
		(match): LivePreviewSyntaxRange => {
			const from = match.index;
			const openingLength = match[0].startsWith('!') ? 2 : 1;
			const label = match[1] ?? '';
			return {
				from,
				to: from + match[0].length,
				contentFrom: from + openingLength,
				contentTo: from + openingLength + label.length,
				className: match[0].startsWith('!')
					? 'mark-base-live-preview__embed'
					: 'mark-base-live-preview__link',
			};
		},
	);
}

function findComments(markdown: string): LivePreviewSyntaxRange[] {
	return Array.from(
		markdown.matchAll(/%%[^\n]*?%%/g),
		(match): LivePreviewSyntaxRange => ({
			from: match.index,
			to: match.index + match[0].length,
			contentFrom: match.index,
			contentTo: match.index + match[0].length,
			className: 'mark-base-live-preview__comment',
			hideWhole: true,
		}),
	);
}

function findBlockSyntax(markdown: string): LivePreviewSyntaxRange[] {
	const ranges: LivePreviewSyntaxRange[] = [];
	const blockPatterns: Array<{
		pattern: RegExp;
		className: (match: RegExpExecArray) => string;
		marker?: (match: RegExpExecArray) => string;
	}> = [
		{
			pattern: /^( {0,3}#{1,6} +)(.+)$/gm,
			className: (match) =>
				`mark-base-live-preview__heading-${Math.min(6, (match[1]?.match(/#/g) ?? []).length)}`,
		},
		{
			pattern: /^( *> ?)(.+)$/gm,
			className: () => 'mark-base-live-preview__quote',
		},
		{
			pattern: /^(\s*[-*+] \[([ xX])\] )(.+)$/gm,
			className: () => 'mark-base-live-preview__list-item',
			marker: (match) => (match[2]?.toLowerCase() === 'x' ? '☑' : '☐'),
		},
		{
			pattern: /^(\s*[-*+] )(?!\[[ xX]\] )(.+)$/gm,
			className: () => 'mark-base-live-preview__list-item',
			marker: () => '•',
		},
		{
			pattern: /^(\s*(\d+)[.)] )(.+)$/gm,
			className: () => 'mark-base-live-preview__list-item',
			marker: (match) => `${match[2] ?? '1'}.`,
		},
	];

	for (const block of blockPatterns) {
		for (const match of markdown.matchAll(block.pattern)) {
			const from = match.index;
			const prefixLength = match[1]?.length ?? 0;
			ranges.push({
				from,
				to: from + match[0].length,
				contentFrom: from + prefixLength,
				contentTo: from + match[0].length,
				className: block.className(match),
				marker: block.marker?.(match),
			});
		}
	}
	return ranges;
}

function findTags(markdown: string): LivePreviewSyntaxRange[] {
	return Array.from(
		markdown.matchAll(/(^|\s)(#[\p{L}\p{N}_/-]+)/gu),
		(match): LivePreviewSyntaxRange => {
			const from = match.index + (match[1]?.length ?? 0);
			return {
				from,
				to: from + (match[2]?.length ?? 0),
				contentFrom: from,
				contentTo: from + (match[2]?.length ?? 0),
				className: 'mark-base-live-preview__tag',
			};
		},
	);
}