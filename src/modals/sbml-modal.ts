import { App, Modal, Setting, Notice } from "obsidian";
import { parseSBML } from "../sbml-parser";
import { createNetworkNotes } from "../note-builder";

export class SBMLImportModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Import SBML Model" });

		// ==========================================
		// OPTION 1: BIOMODELS API FETCH
		// ==========================================
		contentEl.createEl("h3", { text: "Option 1: Download from BioModels" });
		let bioModelId = ""; // Store the ID the user types

		new Setting(contentEl)
			.setName("BioModels ID")
			.setDesc("Enter a valid ID (e.g., BIOMD0000000010)")
			.addText((text) =>
				text.setPlaceholder("BIOMD...").onChange((value) => {
					bioModelId = value.trim();
				}),
			)
			.addButton((btn) => {
				btn.setButtonText("Fetch & Parse").onClick(async () => {
					if (!bioModelId) {
						new Notice("Please enter a BioModels ID first.");
						return;
					}

					btn.setButtonText("Fetching...");

					try {
						// The direct download URL for BioModels API
						const url = `https://www.ebi.ac.uk/biomodels/model/download/${bioModelId}?filename=${bioModelId}_url.xml`;

						// JavaScript's built-in fetch API makes network requests
						const response = await fetch(url);
						if (!response.ok)
							throw new Error("Could not find that model.");

						// Wait for the text content to download
						const xmlText = await response.text();

						// Hand it off to our custom parser!
						const parsedData = parseSBML(xmlText);

						console.log("BioModels Data:", parsedData);
						new Notice(
							`Success! Parsed ${parsedData.species.length} species. (Check Console)`,
						);
						this.close();
					} catch (error) {
						console.error(error);
						new Notice(
							"Failed to fetch model. Check the ID and try again.",
						);
						btn.setButtonText("Fetch & Parse");
					}
				});
			});

		// ==========================================
		// OPTION 2: LOCAL FILE UPLOAD
		// ==========================================
		contentEl.createEl("h3", { text: "Option 2: Local File" });

		new Setting(contentEl)
			.setName("Select SBML File")
			.setDesc("Pick an .xml or .sbml file from your computer.")
			.addButton((btn) => {
				const input = contentEl.createEl("input", {
					type: "file",
					attr: { accept: ".xml,.sbml" },
				});
				input.style.display = "none"; // Hide the ugly default HTML file input

				input.addEventListener("change", async (e) => {
					const file = (e.target as HTMLInputElement).files?.[0];
					if (file) {
						try {
							const xmlText = await file.text();

							// Hand it off to our custom parser!
							const parsedData = parseSBML(xmlText);

							// Trigger the Note Builder
							new Notice("Building network notes...");
							const folderCreated = await createNetworkNotes(
								this.app,
								parsedData,
							);

							console.log(
								"Network generated in folder:",
								folderCreated,
							);
							new Notice(
								`Success! Created network in /${folderCreated}/`,
							);
							this.close();
						} catch (error) {
							console.error(error);
							new Notice(
								"Error parsing local file. Is it valid XML?",
							);
						}
					}
				});

				// When the stylized Obsidian button is clicked, trigger the hidden HTML file input
				btn.setButtonText("Choose File").onClick(() => input.click());
			});
	}

	onClose() {
		this.contentEl.empty(); // Clean up the DOM when the modal closes
	}
}
