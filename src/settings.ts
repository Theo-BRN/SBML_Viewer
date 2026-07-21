import { App, PluginSettingTab, Setting } from "obsidian";
import type SBMLViewerPlugin from "./main";

export interface SBMLViewerSettings {
	/** Vault folder that imported models are saved into. Empty means the vault root. */
	outputFolder: string;
	/** Whether each import also adds a graph bookmark scoped to that model. */
	createGraphBookmark: boolean;
}

export const DEFAULT_SETTINGS: SBMLViewerSettings = {
	outputFolder: "SBML Models",
	createGraphBookmark: true,
};

export class SBMLViewerSettingTab extends PluginSettingTab {
	private readonly plugin: SBMLViewerPlugin;

	constructor(app: App, plugin: SBMLViewerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Output folder")
			.setDesc(
				"Where imported models are saved. Each import creates its own timestamped subfolder inside this folder. Leave empty to save to the vault root.",
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.outputFolder)
					.setValue(this.plugin.settings.outputFolder)
					.onChange(async (value) => {
						this.plugin.settings.outputFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Create a graph bookmark for each import")
			.setDesc(
				"Adds a bookmark that opens the graph filtered to the imported model, with node colours already set up. Turn this off to leave your bookmarks untouched.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.createGraphBookmark)
					.onChange(async (value) => {
						this.plugin.settings.createGraphBookmark = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
