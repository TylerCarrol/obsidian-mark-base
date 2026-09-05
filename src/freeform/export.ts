import { extractMarkdownBody } from './content';

export interface ExportTransformOptions {
	stripYamlFrontmatter: boolean;
	stripComments: boolean;
	trimWhitespace: boolean;
	stripLinks: boolean;
}

export function transformExportMarkdown(
	markdown: string,
	options: ExportTransformOptions,
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
		transformed = transformed.trim();
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