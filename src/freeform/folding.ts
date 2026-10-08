import { setIcon } from 'obsidian';
import { SOURCE_PATH_ATTRIBUTE } from './content';

interface HeadingSection {
	element: HTMLElement;
	index: number;
	level: number;
	end: number;
	collapsed: boolean;
}

function createFoldButton(
	parent: HTMLElement,
	className: string,
	onToggle: () => void,
): HTMLButtonElement {
	const button = parent.createEl('button', {
		cls: `mark-base-freeform__fold-button ${className}`,
		attr: { type: 'button' },
	});
	setIcon(button, 'chevron-right');
	button.addEventListener('click', (event) => {
		event.stopPropagation();
		onToggle();
	});
	return button;
}

function updateFoldButton(
	button: HTMLButtonElement,
	collapsed: boolean,
	subject: string,
): void {
	const label = `${collapsed ? 'Expand' : 'Collapse'} ${subject}`;
	button.classList.toggle('is-collapsed', collapsed);
	button.setAttribute('aria-expanded', String(!collapsed));
	button.setAttribute('aria-label', label);
	button.title = label;
}

function getContentBlocks(container: HTMLElement): HTMLElement[] {
	return Array.from(container.querySelectorAll<HTMLElement>(':scope > *')).flatMap((child) => {
		if (child.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
			return [];
		}
		// Only traverse our own wrappers, not headings inside embeds or callouts.
		if (
			child.matches(
				'.mark-base-freeform__contents, .mark-base-freeform__contents-block',
			)
		) {
			return getContentBlocks(child);
		}
		return [child];
	});
}

export class FreeformFolding {
	private sections: HeadingSection[] = [];
	private blocks: HTMLElement[] = [];

	constructor(
		private readonly entryEl: HTMLElement,
		private readonly contentEl: HTMLElement,
		private readonly headingFolding: boolean,
		noteFolding: boolean,
	) {
		entryEl.classList.toggle('mark-base-freeform__entry--heading-folding', headingFolding);
		entryEl.classList.toggle('mark-base-freeform__entry--note-folding', noteFolding);
		if (noteFolding) {
			const sourcePath = entryEl.getAttribute(SOURCE_PATH_ATTRIBUTE) ?? '';
			const noteName = sourcePath.split('/').pop()?.replace(/\.md$/i, '') || 'Note';
			const summary = entryEl.createSpan({
				cls: 'mark-base-freeform__folded-note-label',
				text: noteName,
			});
			summary.hidden = true;
			const button = createFoldButton(
				entryEl,
				'mark-base-freeform__note-fold-button',
				() => {
					const collapsed = !contentEl.hidden;
					contentEl.hidden = collapsed;
					summary.hidden = !collapsed;
					entryEl.classList.toggle('mark-base-freeform__entry--collapsed', collapsed);
					updateFoldButton(button, collapsed, `note: ${noteName}`);
				},
			);
			updateFoldButton(button, false, `note: ${noteName}`);
		}
		this.refreshHeadings();
	}

	refreshHeadings(): void {
		if (!this.headingFolding) {
			return;
		}
		const previousStates = new Map(
			this.sections.map((section) => [section.element, section.collapsed]),
		);
		for (const block of this.blocks) {
			block.hidden = false;
		}
		for (const section of this.sections) {
			section.element.querySelector('.mark-base-freeform__heading-fold-button')?.remove();
			section.element.classList.remove('mark-base-freeform__foldable-heading', 'is-collapsed');
		}
		this.blocks = getContentBlocks(this.contentEl);
		this.sections = this.blocks.flatMap((element, index) =>
			/^H[1-6]$/.test(element.tagName)
				? [{
					element,
					index,
					level: Number(element.tagName.slice(1)),
					end: this.blocks.length,
					collapsed: previousStates.get(element) ?? false,
				}]
				: [],
		);
		for (const section of this.sections) {
			section.end = this.sections.find(
				(candidate) => candidate.index > section.index && candidate.level <= section.level,
			)?.index ?? this.blocks.length;
			if (section.end === section.index + 1) {
				continue;
			}
			const headingText = section.element.textContent ?? '';
			section.element.classList.add('mark-base-freeform__foldable-heading');
			const button = createFoldButton(
				section.element,
				'mark-base-freeform__heading-fold-button',
				() => {
					section.collapsed = !section.collapsed;
					updateFoldButton(button, section.collapsed, `section: ${headingText}`);
					this.updateVisibility();
				},
			);
			updateFoldButton(button, section.collapsed, `section: ${headingText}`);
		}
		this.updateVisibility();
	}

	private updateVisibility(): void {
		for (const section of this.sections) {
			section.element.classList.toggle('is-collapsed', section.collapsed);
		}
		for (const [index, block] of this.blocks.entries()) {
			block.hidden = this.sections.some(
				(section) => section.collapsed && index > section.index && index < section.end,
			);
		}
		for (const wrapper of Array.from(this.contentEl.querySelectorAll<HTMLElement>(
			'.mark-base-freeform__contents, .mark-base-freeform__contents-block',
		))) {
			const blocks = getContentBlocks(wrapper);
			wrapper.hidden = blocks.length > 0 && blocks.every((block) => block.hidden);
		}
	}
}
