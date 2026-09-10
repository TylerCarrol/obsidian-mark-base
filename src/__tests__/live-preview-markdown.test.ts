import { describe, expect, it } from 'vitest';
import { findLivePreviewSyntax } from '../freeform/live-preview-markdown';

describe('findLivePreviewSyntax', () => {
	it('identifies bold delimiters separately from formatted content', () => {
		expect(findLivePreviewSyntax('Before **some bolded text** after')).toContainEqual({
			from: 7,
			to: 27,
			contentFrom: 9,
			contentTo: 25,
			className: 'mark-base-live-preview__bold',
		});
	});

	it('shows an aliased wikilink label when its syntax is hidden', () => {
		expect(findLivePreviewSyntax('See [[People/Ada|Ada Lovelace]].')).toContainEqual({
			from: 4,
			to: 31,
			contentFrom: 17,
			contentTo: 29,
			className: 'mark-base-live-preview__link',
		});
	});

	it('supports headings, lists, highlights, tags, and comments', () => {
		const ranges = findLivePreviewSyntax(
			'# Plan\n\n- Review ==draft== #writing %%private%%',
		);

		expect(ranges.map((range) => range.className)).toEqual(
			expect.arrayContaining([
				'mark-base-live-preview__heading-1',
				'mark-base-live-preview__list-item',
				'mark-base-live-preview__highlight',
				'mark-base-live-preview__tag',
				'mark-base-live-preview__comment',
			]),
		);
		expect(ranges.find((range) => range.hideWhole)).toMatchObject({
			className: 'mark-base-live-preview__comment',
			hideWhole: true,
		});
	});

	it('does not format Markdown-like text inside inline code or comments', () => {
		const ranges = findLivePreviewSyntax(
			'`**code**` and %%==not highlighted==%%',
		);

		expect(ranges.map((range) => range.className)).toEqual([
			'mark-base-live-preview__code',
			'mark-base-live-preview__comment',
		]);
	});

	it('decorates a task as one list item', () => {
		const listRanges = findLivePreviewSyntax('- [x] Complete').filter(
			(range) =>
				range.className === 'mark-base-live-preview__list-item',
		);

		expect(listRanges).toEqual([
			expect.objectContaining({
				contentFrom: 6,
				marker: '☑',
			}),
		]);
	});
});