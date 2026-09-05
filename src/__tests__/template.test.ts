import { describe, expect, it, vi } from 'vitest';
import { interpolateTemplate } from '../freeform/template';

describe('interpolateTemplate', () => {
	it('replaces note, formula, and file placeholders', () => {
		const values: Record<string, string> = {
			'note.title': 'Example note',
			'formula.byline': 'A computed value',
			'file.path': 'Notes/Example note.md',
			'file.contents': 'The note body.',
		};

		const result = interpolateTemplate(
			'# {{ note.title }}\n{{formula.byline}}\n{{file.path}}\n{{file.contents}}',
			(propertyId) => values[propertyId],
		);

		expect(result).toBe(
			'# Example note\nA computed value\nNotes/Example note.md\nThe note body.',
		);
	});

	it('renders missing property values as empty strings', () => {
		expect(
			interpolateTemplate('Before {{note.missing}} after', () => null),
		).toBe('Before  after');
	});

	it('leaves unsupported placeholders unchanged', () => {
		const resolver = vi.fn(() => 'unused');

		expect(interpolateTemplate('{{title}} {{unknown.value}}', resolver)).toBe(
			'{{title}} {{unknown.value}}',
		);
		expect(resolver).not.toHaveBeenCalled();
	});
});
