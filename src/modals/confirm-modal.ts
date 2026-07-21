import { App, Modal, Setting } from "obsidian";

/**
 * Ask the user to confirm an action.
 * Resolves true if they confirm, false if they cancel or dismiss the modal.
 */
export function confirmAction(
	app: App,
	heading: string,
	body: string,
	confirmText: string,
): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(app, heading, body, confirmText, resolve).open();
	});
}

class ConfirmModal extends Modal {
	private readonly heading: string;
	private readonly body: string;
	private readonly confirmText: string;
	private readonly resolve: (value: boolean) => void;
	private settled = false;

	constructor(
		app: App,
		heading: string,
		body: string,
		confirmText: string,
		resolve: (value: boolean) => void,
	) {
		super(app);
		this.heading = heading;
		this.body = body;
		this.confirmText = confirmText;
		this.resolve = resolve;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.heading });
		contentEl.createEl("p", { text: this.body });

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText("Cancel").onClick(() => this.settle(false)),
			)
			.addButton((btn) =>
				btn
					.setButtonText(this.confirmText)
					.setCta()
					.onClick(() => this.settle(true)),
			);
	}

	onClose() {
		this.contentEl.empty();
		// Dismissing with Esc or a click outside counts as a cancel.
		this.settle(false);
	}

	private settle(value: boolean) {
		if (this.settled) return;
		this.settled = true;
		this.resolve(value);
		this.close();
	}
}
