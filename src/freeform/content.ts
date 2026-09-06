import type { BasesPropertyId } from 'obsidian';

export const SOURCE_PATH_ATTRIBUTE = 'data-mark-base-source-path';
export const FILE_CONTENTS_PROPERTY_ID: BasesPropertyId = 'file.contents';

export interface OrderedEntryProperty {
	propertyId: BasesPropertyId;
	value: unknown;
}

export interface InternalLinkTarget {
	linktext: string;
	sourcePath: string;
}

export function expandEscapedNewlines(markdown: string): string {
	return markdown.replace(/\\+n/g, '\n');
}

export function extractMarkdownBody(fileContent: string): string {
	return fileContent.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '');
}

export function trimFileBoundaryWhitespace(fileContent: string): string {
	return fileContent.trim();
}

export function includeFileContentsProperty(
	properties: BasesPropertyId[],
): BasesPropertyId[] {
	if (properties.includes(FILE_CONTENTS_PROPERTY_ID)) {
		return properties;
	}

	return [...properties, FILE_CONTENTS_PROPERTY_ID];
}

export function appendFileContentsProperty(
	properties: BasesPropertyId[],
): BasesPropertyId[] {
	return [
		...properties.filter(
			(propertyId) => propertyId !== FILE_CONTENTS_PROPERTY_ID,
		),
		FILE_CONTENTS_PROPERTY_ID,
	];
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
