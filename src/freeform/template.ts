import type { BasesPropertyId } from 'obsidian';

type PropertyResolver = (
	propertyId: BasesPropertyId,
) => string | null | undefined;

const PROPERTY_PLACEHOLDER =
	/\{\{\s*((?:note|formula|file)\.[^{}\n]+?)\s*\}\}/g;

export function getTemplateProperties(template: string): BasesPropertyId[] {
	return [...new Set(
		Array.from(template.matchAll(PROPERTY_PLACEHOLDER), (match) =>
			(match[1] ?? '').trim() as BasesPropertyId),
	)];
}

export function interpolateTemplate(
	template: string,
	resolveProperty: PropertyResolver,
): string {
	return template.replace(
		PROPERTY_PLACEHOLDER,
		(_placeholder, propertyId: string) =>
			resolveProperty(propertyId.trim() as BasesPropertyId) ?? '',
	);
}
