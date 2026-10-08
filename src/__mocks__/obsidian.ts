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
}

export class BooleanValue {}
export class Component {}
export const Keymap = {};
export const MarkdownRenderer = {};
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
