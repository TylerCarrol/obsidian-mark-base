import type { App, BasesEntry, BasesPropertyId } from 'obsidian';
import {
	expandEscapedNewlines,
	FILE_CONTENTS_PROPERTY_ID,
	trimFileBoundaryWhitespace,
	type OrderedEntryProperty,
} from './content';
import { decodeExcerptInstruction } from './excerpt-instruction';
import { ExcerptMetadata } from './excerpt-metadata';
import { matchExcerptRegex } from './excerpt-regex';
import {
	createExcerptSource,
	getExcerptBlocks,
	joinExcerptRanges,
	selectLineRange,
	selectTaggedRanges,
	type ExcerptSource,
} from './excerpt-selection';

export interface EntryPropertyApp {
	vault: Pick<App['vault'], 'cachedRead'>;
	metadataCache: Pick<App['metadataCache'], 'getFileCache'>;
}

export class EntryPropertyResolver {
	private source: Promise<ExcerptSource> | undefined;
	private readonly values = new Map<BasesPropertyId, Promise<string>>();

	constructor(
		private readonly app: EntryPropertyApp,
		private readonly entry: BasesEntry,
		private readonly metadata: ExcerptMetadata,
		private readonly signal: AbortSignal,
		private readonly trimFileWhitespace: boolean,
	) {}

	readSource(): Promise<ExcerptSource> {
		this.source ??= this.app.vault.cachedRead(this.entry.file).then((content) => {
			this.checkCancelled();
			return createExcerptSource(content);
		});
		return this.source;
	}

	resolve(propertyId: BasesPropertyId): Promise<string> {
		let value = this.values.get(propertyId);
		if (!value) {
			value = this.resolveValue(propertyId);
			this.values.set(propertyId, value);
		}
		return value;
	}

	async resolveOrdered(properties: BasesPropertyId[]): Promise<OrderedEntryProperty[]> {
		const resolved: OrderedEntryProperty[] = [];
		for (const propertyId of properties) {
			resolved.push({
				propertyId,
				value: await this.resolve(propertyId),
				preserveEscapedNewlines: propertyId !== FILE_CONTENTS_PROPERTY_ID,
			});
		}
		return resolved;
	}

	private checkCancelled(): void {
		if (this.signal.aborted) {
			throw new Error('Excerpt selection was cancelled.');
		}
	}

	private async resolveValue(propertyId: BasesPropertyId): Promise<string> {
		this.checkCancelled();
		if (propertyId === FILE_CONTENTS_PROPERTY_ID) {
			const { body } = await this.readSource();
			return this.trimFileWhitespace ? trimFileBoundaryWhitespace(body) : body;
		}
		const value = this.entry.getValue(propertyId);
		try {
			const instruction = propertyId.startsWith('formula.')
				? decodeExcerptInstruction(value)
				: null;
			if (!instruction) {
				return expandEscapedNewlines(value?.toString() ?? '');
			}
			const source = await this.readSource();
			if (instruction.selector === 'lines') {
				return selectLineRange(source, instruction.start, instruction.end);
			}
			const metadata = instruction.selector === 'tag' || instruction.mode === 'blocks'
				? this.metadata.get(this.entry.file, source.content, this.app.metadataCache)
				: null;
			const ranges = instruction.mode === 'blocks' && metadata
				? getExcerptBlocks(source, metadata)
				: source.lines;
			const separator = instruction.mode === 'blocks' ? '\n\n' : '\n';
			if (instruction.selector === 'tag' && metadata) {
				return joinExcerptRanges(source, selectTaggedRanges(source, metadata, instruction.tag, ranges), separator);
			}
			if (instruction.selector === 'regex') {
				const indices = new Set(await matchExcerptRegex(
					ranges.map((range) => source.body.slice(range.start, range.end)),
					instruction.pattern,
					instruction.flags,
					this.signal,
				));
				return joinExcerptRanges(source, ranges.filter((_range, index) => indices.has(index)), separator);
			}
			throw new Error('Tag metadata is unavailable.');
		} catch (error) {
			throw new Error(`${propertyId} in "${this.entry.file.path}": ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
