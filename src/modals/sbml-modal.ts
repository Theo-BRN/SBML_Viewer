import { App, Modal, Notice, Setting, requestUrl } from "obsidian";
import { parseSBML } from "../sbml-parser";
import { createNetworkNotes } from "../note-builder";
import { addModelGraphBookmark } from "../graph-bookmark";
import type { SBMLViewerSettings } from "../settings";

const BIOMODELS_HOSTS = [
	"https://www.ebi.ac.uk/biomodels",
	"https://www.biomodels.org",
];

interface BioModelsFilesResponse {
	main?: { name?: string }[];
}

export class SBMLImportModal extends Modal {
	private readonly settings: SBMLViewerSettings;

	constructor(app: App, settings: SBMLViewerSettings) {
		super(app);
		this.settings = settings;
	}

	onOpen() {
		const { contentEl } = this;
		this.titleEl.setText("Import SBML model");

		// --- OPTION 1: LOCAL FILE ---
		// A hidden native file input (as required for security reasons), triggered by the styled Obsidian button below.
		const fileInputButton = contentEl.createEl("input", {
			type: "file",
			attr: { accept: ".xml,.sbml" },
		});
		fileInputButton.hide();

		fileInputButton.addEventListener("change", () => {
			const file = fileInputButton.files?.[0];
			// After a failed import, the modal stays open and a user re-picking the same filepath doesn't fire a change - so plugin would seem broken
			fileInputButton.value = "";
			if (file) void this.importLocalFile(file);
		});

		new Setting(contentEl)
			.setName("From SBML file")
			.setDesc("Choose an .xml or .sbml file from your computer.")
			.addButton((btn) =>
				btn
					.setButtonText("Choose file")
					.onClick(() => fileInputButton.click()),
			);

		// --- OPTION 2: DOWNLOAD FROM BIOMODELS ---
		// new Setting(contentEl).setName("From BioModels").setHeading();
		let bioModelId = "";

		new Setting(contentEl)
			.setName("Using BioModels ID")
			.setDesc("Choose a model from https://www.biomodels.org.")
			.addText((text) =>
				text.setPlaceholder("MODEL2306220001").onChange((value) => {
					bioModelId = value.trim();
				}),
			)
			.addButton((btn) =>
				btn
					.setButtonText("Fetch and import")
					.setCta() // cta is 'call to action'
					.onClick(async () => {
						if (!bioModelId) {
							new Notice("Enter a BioModels ID first.");
							return;
						}

						btn.setDisabled(true).setButtonText("Fetching…");
						try {
							const xml = await downloadBioModel(bioModelId);
							await this.importModel(xml);
						} catch (error) {
							console.error(error);
							new Notice(describeError(error));
						} finally {
							btn.setDisabled(false).setButtonText(
								"Fetch and import",
							);
						}
					}),
			);
	}

	private async importLocalFile(file: File) {
		try {
			await this.importModel(await file.text());
		} catch (error) {
			console.error(error);
			new Notice(describeError(error));
		}
	}

	/** Parse the model and turn it into notes. Shared by both import routes. */
	private async importModel(xmlText: string) {
		const data = parseSBML(xmlText);
		const folder = await createNetworkNotes(
			this.app,
			data,
			this.settings.outputFolder,
		);

		// createNetworkNotes returns null when the user declines a large import.
		if (!folder) {
			new Notice("Import cancelled.");
			return;
		}

		if (this.settings.createGraphBookmark) {
			const bookmarked = await addModelGraphBookmark(
				this.app,
				data,
				folder,
			);
			if (!bookmarked) {
				new Notice(
					"Notes were created, but the graph bookmark could not be added.",
				);
			}
		}

		new Notice(
			`Imported ${data.modelId}: ${data.species.size} species, ${data.reactions.size} reactions.`,
		);
		this.close();
	}

	onClose() {
		this.contentEl.empty();
	}
}

/** Ask BioModels which file holds the model's SBML. Returns null if it can't be determined. */
async function resolveBioModelsFilename(
	host: string,
	id: string,
): Promise<string | null> {
	const response = await requestUrl({
		url: `${host}/model/files/${id}?format=json`,
	});
	// Shape: { main: [{ name, mimeType, ... }], additional: [...] }
	const payload = response.json as BioModelsFilesResponse | undefined;
	const name = payload?.main?.[0]?.name;

	return typeof name === "string" ? name : null;
}

/** Download a model's main SBML document from BioModels. */
async function downloadBioModel(modelId: string): Promise<string> {
	const id = encodeURIComponent(modelId);
	let lastError = "";

	for (const host of BIOMODELS_HOSTS) {
		const biomodelsFilename = await resolveBioModelsFilename(
			host,
			id,
		).catch(() => null);
		const filenames = Array.from(
			new Set(
				[biomodelsFilename, `${modelId}_url.xml`].filter(
					(name): name is string => !!name,
				),
			),
		);

		for (const filename of filenames) {
			try {
				const response = await requestUrl({
					url: `${host}/model/download/${id}?filename=${encodeURIComponent(filename)}`,
				});
				if (response.text.trim().length > 0) return response.text;
			} catch (error) {
				lastError = describeError(error);
			}
		}
	}

	throw new Error(
		`Could not download "${modelId}" from BioModels. Check the ID is correct.` +
			(lastError ? ` (${lastError})` : ""),
	);
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
