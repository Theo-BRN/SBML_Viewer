export interface SpeciesRef {
	species: string;
	stoichiometry: number;
}

export interface SpeciesData {
	id: string;
	name: string;
	compartment: string;
	reactantIn: string[];
	productIn: string[];
	modifierIn: string[];
}

export interface ReactionData {
	id: string;
	name: string;
	reversible: boolean;
	reactants: SpeciesRef[];
	products: SpeciesRef[];
	modifiers: string[];
}

export interface SBMLData {
	modelId: string;
	compartments: { id: string; name: string }[];
	species: Map<string, SpeciesData>; // Using a Map for easy ID lookup
	reactions: Map<string, ReactionData>;
}

export function parseSBML(xmlString: string): SBMLData {
	const parser = new DOMParser();
	const xmlDoc = parser.parseFromString(xmlString, "application/xml");

	if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
		throw new Error("Error parsing XML.");
	}

	// Try to get model ID for folder naming later
	const modelNode = xmlDoc.getElementsByTagName("model")[0];
	const modelId = modelNode
		? modelNode.getAttribute("id") || "SBML_Model"
		: "SBML_Model";

	const data: SBMLData = {
		modelId,
		compartments: [],
		species: new Map(),
		reactions: new Map(),
	};

	// --- EXTRACT SPECIES ---
	const speciesNodes = xmlDoc.getElementsByTagName("species");
	for (let i = 0; i < speciesNodes.length; i++) {
		const id = speciesNodes[i].getAttribute("id") || `Unknown_Species_${i}`;
		data.species.set(id, {
			id,
			name: speciesNodes[i].getAttribute("name") || id,
			compartment: speciesNodes[i].getAttribute("compartment") || "None",
			reactantIn: [],
			productIn: [],
			modifierIn: [],
		});
	}

	// --- EXTRACT REACTIONS & BUILD CROSS-LINKS ---
	const reactionNodes = xmlDoc.getElementsByTagName("reaction");
	for (let i = 0; i < reactionNodes.length; i++) {
		const rxnNode = reactionNodes[i];
		const rxnId = rxnNode.getAttribute("id") || `Unknown_Reaction_${i}`;
		const reversible = rxnNode.getAttribute("reversible") === "true";

		const reaction: ReactionData = {
			id: rxnId,
			name: rxnNode.getAttribute("name") || rxnId,
			reversible,
			reactants: [],
			products: [],
			modifiers: [],
		};

		// Helper function to extract lists
		const extractList = (listName: string, refName: string) => {
			const listNode = rxnNode.getElementsByTagName(listName)[0];
			if (!listNode) return [];
			return Array.from(listNode.getElementsByTagName(refName));
		};

		// Reactants
		extractList("listOfReactants", "speciesReference").forEach((ref) => {
			const spId = ref.getAttribute("species");
			if (spId) {
				const stoich = parseFloat(
					ref.getAttribute("stoichiometry") || "1.0",
				);
				reaction.reactants.push({
					species: spId,
					stoichiometry: stoich,
				});
				data.species.get(spId)?.reactantIn.push(rxnId);
			}
		});

		// Products
		extractList("listOfProducts", "speciesReference").forEach((ref) => {
			const spId = ref.getAttribute("species");
			if (spId) {
				const stoich = parseFloat(
					ref.getAttribute("stoichiometry") || "1.0",
				);
				reaction.products.push({
					species: spId,
					stoichiometry: stoich,
				});
				data.species.get(spId)?.productIn.push(rxnId);
			}
		});

		// Modifiers
		extractList("listOfModifiers", "modifierSpeciesReference").forEach(
			(ref) => {
				const spId = ref.getAttribute("species");
				if (spId) {
					reaction.modifiers.push(spId);
					data.species.get(spId)?.modifierIn.push(rxnId);
				}
			},
		);

		data.reactions.set(rxnId, reaction);
	}

	return data;
}
