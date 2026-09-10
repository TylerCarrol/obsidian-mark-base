import type { App } from 'obsidian';
import {
	autocompletion,
	completionKeymap,
	type Completion,
	type CompletionContext,
	type CompletionResult,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	EditorView,
	keymap,
	type ViewUpdate,
	ViewPlugin,
} from '@codemirror/view';
import {
	findLivePreviewSyntax,
	type LivePreviewSyntaxRange,
} from './live-preview-markdown';

export interface LivePreviewEditorOptions {
	app: App;
	parent: HTMLElement;
	value: string;
	sourcePath: string;
	initialCoordinates: { x: number; y: number };
	onChange: (value: string) => void;
	onBlur: () => void;
}

export function createLivePreviewEditor(
	options: LivePreviewEditorOptions,
): EditorView {
	const editor = new EditorView({
		parent: options.parent,
		state: EditorState.create({
			doc: options.value,
			extensions: [
				history(),
				keymap.of([
					...completionKeymap,
					...defaultKeymap,
					...historyKeymap,
				]),
				EditorView.lineWrapping,
				EditorView.contentAttributes.of({
					'aria-label': 'File contents',
					spellcheck: 'true',
				}),
				livePreviewDecorations,
				autocompletion({
					override: [
						createWikiLinkCompletionSource(
							options.app,
							options.sourcePath,
						),
					],
					activateOnTyping: true,
					maxRenderedOptions: 50,
				}),
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						options.onChange(update.state.doc.toString());
					}
				}),
				EditorView.domEventHandlers({
					blur: () => {
						options.onBlur();
					},
				}),
			],
		}),
	});

	editor.focus();
	const initialPosition = editor.posAtCoords(options.initialCoordinates);
	if (initialPosition !== null) {
		editor.dispatch({ selection: { anchor: initialPosition } });
	}
	return editor;
}

class LivePreviewDecorations {
	decorations: DecorationSet;

	constructor(view: EditorView) {
		this.decorations = buildDecorations(view);
	}

	update(update: ViewUpdate): void {
		if (update.docChanged || update.selectionSet) {
			this.decorations = buildDecorations(update.view);
		}
	}
}

const livePreviewDecorations = ViewPlugin.fromClass(LivePreviewDecorations, {
	decorations: (plugin) => plugin.decorations,
});

function buildDecorations(view: EditorView): DecorationSet {
	const decorations: Array<ReturnType<Decoration['range']>> = [];
	for (const range of findLivePreviewSyntax(view.state.doc.toString())) {
		const isActive = selectionIntersectsRange(view, range);
		if (!isActive) {
			if (range.hideWhole) {
				decorations.push(Decoration.replace({}).range(range.from, range.to));
				continue;
			}
			if (range.contentFrom > range.from) {
				decorations.push(
					Decoration.replace({}).range(range.from, range.contentFrom),
				);
			}
			if (range.contentTo < range.to) {
				decorations.push(
					Decoration.replace({}).range(range.contentTo, range.to),
				);
			}
		}
		if (range.contentFrom < range.contentTo) {
			decorations.push(
				Decoration.mark({
					class: range.className,
					attributes: range.marker
						? { 'data-mark-base-marker': range.marker }
						: undefined,
				}).range(range.contentFrom, range.contentTo),
			);
		}
	}
	return Decoration.set(decorations, true);
}

function selectionIntersectsRange(
	view: EditorView,
	range: LivePreviewSyntaxRange,
): boolean {
	return view.state.selection.ranges.some(
		(selection) => selection.from <= range.to && selection.to >= range.from,
	);
}

function createWikiLinkCompletionSource(app: App, sourcePath: string) {
	const sourceParentPath = sourcePath.includes('/')
		? sourcePath.slice(0, sourcePath.lastIndexOf('/'))
		: '/';
	const options = app.vault
		.getMarkdownFiles()
		.map((file) => createWikiLinkCompletion(file, sourceParentPath));
	return (context: CompletionContext): CompletionResult | null => {
		const match = context.matchBefore(/\[\[[^\]\n]*$/);
		if (!match) {
			return null;
		}

		return {
			from: match.from + 2,
			options,
			validFor: /^[^\]\n]*$/,
		};
	};
}

export function createWikiLinkCompletion(
	file: WikiLinkFile,
	sourceParentPath: string,
): Completion {
	const parentPath = file.parent?.path;
	return {
		label: file.basename,
		detail: parentPath && parentPath !== '/' ? parentPath : undefined,
		apply: `${file.basename}]]`,
		type: 'text',
		boost: parentPath === sourceParentPath ? 10 : 0,
	};
}

interface WikiLinkFile {
	basename: string;
	parent: { path: string } | null;
}