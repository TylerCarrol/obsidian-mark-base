import { describe, expect, it } from 'vitest';
import { createWikiLinkCompletion } from '../freeform/live-preview-editor';

describe('createWikiLinkCompletion', () => {
	it('inserts the file name without its vault path', () => {
		const file = {
			basename: 'Ada Lovelace',
			parent: { path: 'People' },
		};

		expect(createWikiLinkCompletion(file, 'Inputs')).toMatchObject({
			label: 'Ada Lovelace',
			detail: 'People',
			apply: 'Ada Lovelace]]',
		});
	});
});