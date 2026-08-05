import { Plugin } from "obsidian";
import { SBMLImportModal } from "./modals/sbml-modal";
import {
	DEFAULT_SETTINGS,
	SBMLViewerSettings,
	SBMLViewerSettingTab,
} from "./settings";

export default class SBMLViewerPlugin extends Plugin {
	settings: SBMLViewerSettings = { ...DEFAULT_SETTINGS };

	async onload() {
		await this.loadSettings();

		// Command palette action
		this.addCommand({
			id: "open-sbml-modal",
			name: "Import SBML model",
			callback: () => this.openImportModal(),
		});

		// Left ribbon icon
		this.addRibbonIcon("network", "Import SBML model", () =>
			this.openImportModal(),
		);

		this.addSettingTab(new SBMLViewerSettingTab(this.app, this));
	}

	onunload() {
		// kept as reminder to handle event listeners or timers (Obsidian handles the rest)
	}

	private openImportModal() {
		new SBMLImportModal(this.app, this.settings).open();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<SBMLViewerSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
