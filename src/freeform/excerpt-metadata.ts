import type { CachedMetadata, MetadataCache, TFile } from 'obsidian';

export class ExcerptMetadata {
	private readonly snapshots = new Map<TFile, { content: string; cache: CachedMetadata }>();
	private readonly pending = new Set<TFile>();
	private readonly requested = new Set<TFile>();

	isRequested(file: TFile): boolean {
		return this.requested.has(file);
	}

	retain(files: TFile[]): void {
		const displayed = new Set(files);
		const tracked = new Set([...this.snapshots.keys(), ...this.pending, ...this.requested]);
		for (const file of tracked) {
			if (!displayed.has(file)) {
				this.snapshots.delete(file);
				this.pending.delete(file);
				this.requested.delete(file);
			}
		}
	}

	modified(file: TFile): void {
		this.pending.add(file);
	}

	changed(file: TFile, content: string, cache: CachedMetadata): void {
		this.snapshots.set(file, { content, cache });
		this.pending.delete(file);
	}

	get(file: TFile, content: string, metadataCache: Pick<MetadataCache, 'getFileCache'>): CachedMetadata {
		this.requested.add(file);
		const snapshot = this.snapshots.get(file);
		if (snapshot?.content === content) {
			return snapshot.cache;
		}
		if (snapshot || this.pending.has(file)) {
			throw new Error('Note metadata is out of date. Wait for Obsidian to index the note.');
		}
		const cache = metadataCache.getFileCache(file);
		if (!cache) {
			throw new Error('Note metadata is unavailable. Wait for Obsidian to index the note.');
		}
		return cache;
	}
}
