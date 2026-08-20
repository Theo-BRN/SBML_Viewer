import { App, Notice, normalizePath } from "obsidian";
import {
	CompartmentData,
	ReactionData,
	SBMLData,
	SpeciesData,
	SpeciesRef,
} from "./sbml-parser";
import { confirmAction } from "./modals/confirm-modal";

// Above this many notes we check with the user before writing anything.
const CONFIRM_THRESHOLD = 1000;
// How often to refresh the progress notice while writing.
const PROGRESS_INTERVAL = 50;

interface PendingNote {
	path: string;
	content: string;
}

/**
 * Turn a parsed model into a folder of linked notes.
 *
 * Link direction is deliberate, because Obsidian draws a graph arrow from the note that
 * contains the link to the note being linked. To get `A → R1 → C` for `A + B -> C`:
 *   - a species note links to the reactions it is a REACTANT or MODIFIER in  (A → R1)
 *   - a reaction note links to its PRODUCT species                           (R1 → C)
 *   - a compartment note links to the species it contains                    (comp → A)
 * The reverse relationships are intentionally NOT linked — they show up in Obsidian's
 * backlinks pane and in the reaction scheme, so the arrows stay biologically correct.
 *
 * Returns the folder that was created, or null if the user cancelled.
 */
export async function createNetworkNotes(
	app: App,
	data: SBMLData,
	baseFolder = "",
): Promise<string | null> {
	const totalNumNotes =
		data.compartments.size + data.species.size + data.reactions.size + 1;

	if (totalNumNotes > CONFIRM_THRESHOLD) {
		const proceed = await confirmAction(
			app,
			"Large model",
			`"${data.modelId}" will create ${totalNumNotes} notes in your vault. This may take a moment.`,
			"Create notes",
		);
		if (!proceed) return null;
	}

	// 1. Create a unique folder for this model inside the configured output folder.
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const modelFolder = `${data.modelId}_${timestamp}`;
	const base = baseFolder.trim().replace(/^\/+|\/+$/g, "");
	const folderPath = normalizePath(
		base ? `${base}/${modelFolder}` : modelFolder,
	);
	await ensureFolder(app, folderPath);

	// 2. Build every note in memory first

	// "_Model Overview" has a space in it, so can't collide with
	// species/reaction/compartment note because SBML ids can't contain spaces
	const notes: PendingNote[] = [
		{
			path: normalizePath(`${folderPath}/_Model Overview.md`),
			content: buildOverviewNote(data),
		},
	];

	for (const compartment of data.compartments.values()) {
		notes.push({
			path: normalizePath(`${folderPath}/${compartment.id}.md`),
			content: buildCompartmentNote(compartment),
		});
	}

	for (const species of data.species.values()) {
		notes.push({
			path: normalizePath(`${folderPath}/${species.id}.md`),
			content: buildSpeciesNote(species),
		});
	}

	for (const reaction of data.reactions.values()) {
		notes.push({
			path: normalizePath(`${folderPath}/${reaction.id}.md`),
			content: buildReactionNote(reaction),
		});
	}

	// 3. Write out pending notes, progress is reported so large models don't look frozen.
	const progress = new Notice(`Creating notes… 0/${notes.length}`, 0); // the 2nd argument 0 stops it being dismissed automatically
	let written = 0;
	let failed = 0;

	for (const note of notes) {
		try {
			await app.vault.create(note.path, note.content);
		} catch {
			failed++;
		}
		written++;
		if (written % PROGRESS_INTERVAL === 0 || written === notes.length) {
			progress.setMessage(`Creating notes… ${written}/${notes.length}`);
		}
	}
	progress.hide();

	if (failed > 0) {
		new Notice(`${failed} note(s) could not be created.`);
	}

	return folderPath;
}

// --- NOTE TEMPLATES ---

function buildSpeciesNote(species: SpeciesData): string {
	const tags = ["Species"];
	if (species.modifierIn.length > 0) tags.push("Modifier");

	const fields: Record<string, string> = {};
	if (species.compartment) fields.compartment = species.compartment;

	let content = frontmatter(tags, fields);

	if (species.isStub) {
		content += `\n*Referenced by a reaction but not declared in this model's species list.*\n`;
	}

	// Outgoing links only: reactant/modifier → reaction.
	content += linkSection("Reactant in", species.reactantIn);
	content += linkSection("Modifier in", species.modifierIn);

	content += `\n*Reactions that produce this species link to it — see **Backlinks**.*\n`;

	return content;
}

function buildReactionNote(reaction: ReactionData): string {
	let content = frontmatter(["Reaction"]);

	content += `\n## Scheme\n${createReactionScheme(reaction)}\n`;

	// Outgoing links only: reaction → product. Reactants are covered by the scheme above
	// and by backlinks, so linking them here would draw a backwards arrow.
	content += linkSection(
		"Products",
		reaction.products.map((ref) => ref.species),
	);

	content += `\n*Reactants and modifiers link to this reaction — see **Backlinks**.*\n`;

	return content;
}

function buildCompartmentNote(compartment: CompartmentData): string {
	let content = frontmatter(["Compartment"]);

	if (compartment.isStub) {
		content += `\n*Referenced by a species but not declared in this model's compartment list.*\n`;
	}

	content +=
		linkSection("Contains", compartment.species) ||
		`\n*No species are assigned to this compartment.*\n`;

	return content;
}

function buildOverviewNote(data: SBMLData): string {
	const modifierCount = Array.from(data.species.values()).filter(
		(species) => species.modifierIn.length > 0,
	).length;

	let content = frontmatter(["ModelOverview"]);

	content += `\n# ${data.modelName}\n\n`;
	content += `- **Model ID:** ${data.modelId}\n`;
	content += `- **SBML:** Level ${data.level}, Version ${data.version}\n`;
	content += `- **Compartments:** ${data.compartments.size}\n`;
	content += `- **Species:** ${data.species.size}\n`;
	content += `- **Reactions:** ${data.reactions.size}\n`;
	content += `- **Species acting as modifiers:** ${modifierCount}\n`;

	content += linkSection(
		"Compartments",
		Array.from(data.compartments.keys()),
	);

	// Anything the plugin doesn't draw gets listed, so it is never silently missing.
	const { overview } = data;
	const hidden: string[] = [];
	if (overview.functionDefinitions > 0)
		hidden.push(`Function definitions: ${overview.functionDefinitions}`);
	if (overview.rules > 0) hidden.push(`Rules: ${overview.rules}`);
	if (overview.events > 0) hidden.push(`Events: ${overview.events}`);
	if (overview.parameters > 0)
		hidden.push(`Parameters: ${overview.parameters}`);
	if (overview.unitDefinitions > 0)
		hidden.push(`Unit definitions: ${overview.unitDefinitions}`);
	if (overview.packages.length > 0)
		hidden.push(`SBML packages: ${overview.packages.join(", ")}`);

	content += `\n## Aspects of model not shown in these notes\n`;
	if (hidden.length === 0) {
		content += `*Nothing — this model is fully represented by the notes in this folder.*\n`;
	} else {
		for (const item of hidden) content += `- ${item}\n`;
		content += `\n*These parts of the model exist but aren't drawn as notes or graph nodes.*\n`;
	}

	return content;
}

// --- HELPERS ---

/** Create a folder, along with any parent folders that don't exist yet. */
async function ensureFolder(app: App, path: string) {
	const segments = path.split("/").filter(Boolean);
	let current = "";

	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		if (app.vault.getAbstractFileByPath(current)) continue;
		try {
			await app.vault.createFolder(current);
		} catch (error) {
			if (!app.vault.getAbstractFileByPath(current)) throw error;
		}
	}
}

function frontmatter(
	tags: string[],
	fields: Record<string, string> = {},
): string {
	let block = "---\ntags:\n";
	for (const tag of tags) block += `  - ${tag}\n`;
	for (const [key, value] of Object.entries(fields)) {
		block += `${key}: "${value}"\n`;
	}
	return block + "---\n";
}

/** A markdown section of wiki links, or an empty string if there is nothing to link. */
function linkSection(heading: string, ids: string[]): string {
	const unique = Array.from(new Set(ids));
	if (unique.length === 0) return "";

	let section = `\n## ${heading}\n`;
	for (const id of unique) section += `- [[${id}]]\n`;
	return section;
}

/** Render the reaction as a LaTeX scheme, e.g. 2 A + B ⇌ C. */
function createReactionScheme(reaction: ReactionData): string {
	const renderSide = (refs: SpeciesRef[]): string => {
		if (refs.length === 0) return "\\emptyset";

		return refs
			.map((ref) => {
				// SBML ids only contain letters, digits and underscores, so once the
				// underscores become spaces the label is safe inside \text{}.
				const label = `\\text{${ref.species.replace(/_/g, " ")}}`;
				return ref.stoichiometry === 1
					? label
					: `${ref.stoichiometry} ${label}`;
			})
			.join(" + ");
	};

	const arrow = reaction.reversible ? "\\rightleftharpoons" : "\\rightarrow";

	return `$$\n${renderSide(reaction.reactants)} ${arrow} ${renderSide(reaction.products)}\n$$`;
}
