import { App, normalizePath } from "obsidian";
import { SBMLData, ReactionData } from "./sbml-parser";

export async function createNetworkNotes(app: App, data: SBMLData) {
	// 1. Create a unique folder for this model
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const folderPath = normalizePath(`${data.modelId}_${timestamp}`);

	await app.vault.createFolder(folderPath);

	// 2. Write Species Notes
	for (const [speciesId, info] of data.species.entries()) {
		let content = `---\ntags:\n  - Species`;
		if (info.modifierIn.length > 0) content += `\n  - Modifier`;
		content += `\n---\n`;

		content += `\n# Produced in Reactions:\n\`\`\`dataview\nLIST\nfrom #Reaction\nwhere contains(file.outlinks, this.file.link)\n\`\`\`\n`;

		content += `\n# Used in Reactions:\n`;
		if (info.reactantIn.length > 0) {
			content += `- [[${info.reactantIn.join("]]\n- [[")}]]\n`;
		} else {
			content += `- No Reactions Found\n`;
		}

		content += `\n# Modifier in Reactions:\n`;
		if (info.modifierIn.length > 0) {
			content += `- [[${info.modifierIn.join("]]\n- [[")}]]\n`;
		} else {
			content += `- No Reactions Found\n`;
		}

		const notePath = normalizePath(`${folderPath}/${speciesId}.md`);
		await app.vault.create(notePath, content);
	}

	// 3. Write Reaction Notes
	for (const [rxnId, rxn] of data.reactions.entries()) {
		const scheme = createReactionScheme(rxn);

		let content = `---\ntags:\n  - Reaction\n---\n`;
		content += `# Scheme\n${scheme}\n`;

		content += `\n# Product Species:\n`;
		if (rxn.products.length > 0) {
			const productIds = rxn.products.map((p) => p.species);
			content += `- [[${productIds.join("]]\n- [[")}]]\n`;
		} else {
			content += `- No species found\n`;
		}

		content += `\n# Reactant Species:\n\`\`\`dataview\nLIST\nfrom #Species\nwhere contains(file.outlinks, this.file.link)\n\`\`\`\n`;

		const notePath = normalizePath(`${folderPath}/${rxnId}.md`);
		await app.vault.create(notePath, content);
	}

	return folderPath;
}

// Helper translated from your Python script to generate LaTeX
function createReactionScheme(reaction: ReactionData): string {
	const processSpeciesList = (
		list: { species: string; stoichiometry: number }[],
	) => {
		const terms = list.map((ref) => {
			if (ref.stoichiometry === 1.0)
				return ref.species.replace(/_/g, " ");
			const isInt = ref.stoichiometry % 1 === 0;
			return `${isInt ? Math.floor(ref.stoichiometry) : ref.stoichiometry} ${ref.species.replace(/_/g, " ")}`;
		});
		return terms.join("} + {");
	};

	let reactantsStr = processSpeciesList(reaction.reactants);
	let productsStr = processSpeciesList(reaction.products);

	if (!reactantsStr) reactantsStr = "EmptySet";
	if (!productsStr) productsStr = "EmptySet";

	const arrow = reaction.reversible ? "\\rightleftharpoons" : "\\rightarrow";

	// Output standard LaTeX formatting block
	return `$$\n{${reactantsStr}} ${arrow} {${productsStr}}\n$$`;
}
