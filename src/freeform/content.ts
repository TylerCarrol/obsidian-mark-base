import type { BasesPropertyId } from 'obsidian';

export const SOURCE_PATH_ATTRIBUTE = 'data-mark-base-playground-source-path';

export interface OrderedEntryProperty {
	propertyId: BasesPropertyId;
	value: unknown;
}

export interface InternalLinkTarget {
	linktext: string;
	sourcePath: string;
}

export function expandEscapedNewlines(markdown: string): string {
	return markdown.replaceAll('\\n', '\n');
}

export function buildOrderedEntryMarkdown(
	properties: OrderedEntryProperty[],
	filePath: string,
	lineSeparator: string,
): string {
	return properties
		.map(({ propertyId, value }) => {
			const markdown = expandEscapedNewlines(value?.toString() ?? '');
			if (!markdown) {
				return '';
			}

			return propertyId === 'file.name'
				? renderInternalLinkMarkup(filePath, markdown)
				: markdown;
		})
		.filter((markdown) => markdown.length > 0)
		.join(lineSeparator);
}

/** Prevents Obsidian from interpreting a Markdown fragment as frontmatter. */
export function escapeLeadingFrontmatter(markdown: string): string {
	return /^---[ \t]*\r?\n/.test(markdown) ? `\n${markdown}` : markdown;
}

export function resolvePropertyOrder(
	configuredOrder: BasesPropertyId[],
	availableProperties: BasesPropertyId[],
): BasesPropertyId[] {
	return configuredOrder.length > 0
		? configuredOrder
		: availableProperties;
}

export function getInternalLinkTarget(
	linkEl: HTMLAnchorElement,
): InternalLinkTarget | null {
	const linktext =
		linkEl.getAttribute('data-href') ?? linkEl.getAttribute('href');
	if (!linktext) {
		return null;
	}

	const sourceEl = linkEl.closest<HTMLElement>(
		`[${SOURCE_PATH_ATTRIBUTE}]`,
	);

	return {
		linktext,
		sourcePath: sourceEl?.getAttribute(SOURCE_PATH_ATTRIBUTE) ?? '',
	};
}

function renderInternalLinkMarkup(linktext: string, text: string): string {
	return `<a class="internal-link" data-href="${escapeHtmlAttribute(linktext)}" href="${escapeHtmlAttribute(linktext)}">${escapeHtmlText(text)}</a>`;
}

function escapeHtmlAttribute(value: string): string {
	return escapeHtmlText(value).replaceAll('"', '&quot;');
}

function escapeHtmlText(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}
