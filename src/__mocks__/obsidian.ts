export class BasesView {
	allProperties: string[] = [];
	app: unknown;
	config: unknown;
	data: unknown;

	constructor(controller: { app: unknown; config: unknown; data: unknown }) {
		this.app = controller.app;
		this.config = controller.config;
		this.data = controller.data;
	}

	addChild<T>(component: T): T {
		return component;
	}

	registerEvent(_event: unknown): void {}
	registerDomEvent(_element: HTMLElement, _event: string, _callback: unknown): void {}
}

export class BooleanValue {}
export class StringValue {
	constructor(private readonly value: string) {}
	toString(): string { return this.value; }
}
export class NumberValue {
	constructor(private readonly value: number) {}
	toString(): string { return String(this.value); }
}
export class ListValue {
	private readonly values: unknown[];
	constructor(values: unknown[]) {
		this.values = values.map((value) => typeof value === 'string'
			? new StringValue(value)
			: typeof value === 'number' ? new NumberValue(value) : value);
	}
	get(index: number): unknown { return this.values[index]; }
	length(): number { return this.values.length; }
	toString(): string { return this.values.join(', '); }
}
export class Component {}
export const Keymap = {};
export const MarkdownRenderer = {
	render: async (
		_app: unknown, _markdown: string, _element: HTMLElement,
		_sourcePath: string, _component: unknown,
	): Promise<void> => {},
};
export class Notice {}
export const normalizePath = (path: string): string => path;
export class TFile {}
export class TFolder {}
export class Modal {}
export class Setting {}
export function setIcon(element: HTMLElement, icon: string): void {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('data-icon', icon);
	element.append(svg);
}
