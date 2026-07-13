import { Plugin } from "obsidian";
import { SBMLImportModal } from "./modals/sbml-modal";

// A minimal settings interface ready for whenever you need it
interface SBMLViewerSettings {
	// e.g., defaultFolder: string;
}

const DEFAULT_SETTINGS: SBMLViewerSettings = {};

export default class MyPlugin extends Plugin {
	settings!: SBMLViewerSettings;

	async onload() {
		await this.loadSettings();

		// 1. Command Palette Action
		this.addCommand({
			id: "open-sbml-modal",
			name: "Import SBML/BioModel File",
			callback: () => {
				new SBMLImportModal(this.app).open();
			},
		});

		// 2. Left Ribbon Icon
		this.addRibbonIcon("network", "Import SBML/BioModel File", () => {
			new SBMLImportModal(this.app).open();
		});
	}

	onunload() {
		// Obsidian handles most cleanup automatically
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
