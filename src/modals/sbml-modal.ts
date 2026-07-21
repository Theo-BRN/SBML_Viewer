import { App, Modal, Notice, Setting, requestUrl } from "obsidian";
import { parseSBML } from "../sbml-parser";
import { createNetworkNotes } from "../note-builder";
import type { SBMLViewerSettings } from "../settings";

// www.ebi.ac.uk/biomodels redirects to www.biomodels.org. We try the canonical EBI address
// first and fall back to the redirect target, so a download works whether or not redirects
// are followed for us.
const BIOMODELS_HOSTS = [
	"https://www.ebi.ac.uk/biomodels",
	"https://www.biomodels.org",
];

/** The part of the BioModels file listing we care about. */
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

		// --- OPTION 1: DOWNLOAD FROM BIOMODELS ---
		new Setting(contentEl).setName("From BioModels").setHeading();

		let bioModelId = "";

		new Setting(contentEl)
			.setName("BioModels ID")
			.setDesc("For example BIOMD0000000010 or MODEL1602080000.")
			.addText((text) =>
				text.setPlaceholder("BIOMD0000000010").onChange((value) => {
					bioModelId = value.trim();
				}),
			)
			.addButton((btn) =>
				btn
					.setButtonText("Fetch and import")
					.setCta()
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

		// --- OPTION 2: LOCAL FILE ---
		new Setting(contentEl).setName("From a local file").setHeading();

		// A hidden native file input, triggered by the styled Obsidian button below.
		const fileInput = contentEl.createEl("input", {
			type: "file",
			attr: { accept: ".xml,.sbml" },
		});
		fileInput.hide();

		fileInput.addEventListener("change", () => {
			const file = fileInput.files?.[0];
			// Clear it so picking the same file again still fires a change event.
			fileInput.value = "";
			if (file) void this.importLocalFile(file);
		});

		new Setting(contentEl)
			.setName("SBML file")
			.setDesc("Choose an .xml or .sbml file from your computer.")
			.addButton((btn) =>
				btn
					.setButtonText("Choose file")
					.onClick(() => fileInput.click()),
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
async function resolveMainFilename(
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
		// The main file's name varies between models, so ask rather than guess, and keep
		// the conventional name as a backstop.
		const resolved = await resolveMainFilename(host, id).catch(() => null);
		const filenames = Array.from(
			new Set(
				[resolved, `${modelId}_url.xml`].filter(
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
		`Could not download "${modelId}" from BioModels. Check the ID is correct — for example BIOMD0000000010.` +
			(lastError ? ` (${lastError})` : ""),
	);
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
