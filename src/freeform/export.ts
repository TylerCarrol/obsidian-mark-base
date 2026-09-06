import { extractMarkdownBody } from './content';

export interface ExportTransformOptions {
	stripYamlFrontmatter: boolean;
	stripComments: boolean;
	trimWhitespace: boolean;
	stripLinks: boolean;
}

export interface ExportOptions extends ExportTransformOptions {
	folder: string;
	file: string;
	type: 'markdown';
	groupByCreatesSeparateOutputFiles: boolean;
	openFileAfterExport: boolean;
}

export interface ExportTransformBoundaries {
	trimStart: boolean;
	trimEnd: boolean;
}

export function getExportFileName(file: string, groupName?: string): string {
	const trimmedFile = file.trim() || 'export.md';
	const extensionIndex = trimmedFile.toLowerCase().endsWith('.md')
		? trimmedFile.length - 3
		: trimmedFile.length;
	const stem = sanitizeFileName(trimmedFile.slice(0, extensionIndex));
	const suffix =
		groupName === undefined
			? ''
			: `-${sanitizeFileName(stripLinkMarkup(groupName))}`;

	return `${stem}${suffix}.md`;
}

export function getExportPath(folder: string, fileName: string): string {
	const normalizedFolder = folder.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
	return normalizedFolder ? `${normalizedFolder}/${fileName}` : fileName;
}

export function transformExportMarkdown(
	markdown: string,
	options: ExportTransformOptions,
	boundaries: ExportTransformBoundaries = {
		trimStart: true,
		trimEnd: true,
	},
): string {
	let transformed = markdown;

	if (options.stripYamlFrontmatter) {
		transformed = extractMarkdownBody(transformed);
	}
	if (options.stripComments) {
		transformed = stripCommentLines(transformed);
	}
	if (options.stripLinks) {
		transformed = stripLinkMarkup(transformed);
	}
	if (options.trimWhitespace) {
		if (boundaries.trimStart) {
			transformed = transformed.trimStart();
		}
		if (boundaries.trimEnd) {
			transformed = transformed.trimEnd();
		}
	}

	return transformed;
}

function stripCommentLines(markdown: string): string {
	let result = '';
	let retainedFrom = 0;

	for (const match of markdown.matchAll(/<!--[\s\S]*?-->|%%[\s\S]*?%%/g)) {
		const matchStart = match.index;
		const lineStart = markdown.lastIndexOf('\n', matchStart - 1) + 1;
		const nextLineBreak = markdown.indexOf('\n', matchStart + match[0].length);
		const lineEnd =
			nextLineBreak === -1 ? markdown.length : nextLineBreak + 1;

		if (lineStart > retainedFrom) {
			result += markdown.slice(retainedFrom, lineStart);
		}
		retainedFrom = Math.max(retainedFrom, lineEnd);
	}

	return result + markdown.slice(retainedFrom);
}

function stripLinkMarkup(markdown: string): string {
	return markdown
		.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
		.replace(
			/!?\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g,
			(_match: string, target: string, alias?: string): string =>
				alias || target,
		)
		.replace(/!?\[([^\]]*)\]\([^\n)]*\)/g, '$1')
		.replace(/!?\[([^\]]*)\]\s*\[[^\]]*\]/g, '$1')
		.replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
		.replace(/<(https?:\/\/[^>]+|mailto:[^>]+)>/gi, '$1');
}

function sanitizeFileName(fileName: string): string {
	const sanitized = fileName
		.replace(/[\\/:*?"<>|]/g, '-')
		.replace(/\s+/g, ' ')
		.replace(/[. ]+$/g, '')
		.trim();

	return sanitized || 'Ungrouped';
}