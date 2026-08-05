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
	isStub: boolean; // referenced by a reaction but never declared in listOfSpecies
}

export interface ReactionData {
	id: string;
	name: string;
	reversible: boolean;
	reactants: SpeciesRef[];
	products: SpeciesRef[];
	modifiers: string[];
}

export interface CompartmentData {
	id: string;
	name: string;
	species: string[]; // ids of species declared in this compartment
	isStub: boolean; // referenced by a species but never declared in listOfCompartments
}

// Counts of model constructs this plugin does not visualise, surfaced in the overview note
// so nothing is silently hidden.
export interface ModelOverview {
	functionDefinitions: number;
	rules: number;
	events: number;
	unitDefinitions: number;
	parameters: number;
	packages: string[]; // SBML L3 package prefixes found on the root, e.g. ["fbc", "comp"]
}

export interface SBMLData {
	modelId: string;
	modelName: string;
	level: number;
	version: number;
	compartments: Map<string, CompartmentData>;
	species: Map<string, SpeciesData>; // Map for easy ID lookup
	reactions: Map<string, ReactionData>;
	overview: ModelOverview;
}

// SBML L3 packages we can at least name if we see them declared on the root.
const KNOWN_PACKAGES = [
	"fbc",
	"comp",
	"layout",
	"qual",
	"multi",
	"distrib",
	"groups",
];

export function parseSBML(xmlString: string): SBMLData {
	const parser = new DOMParser();
	const xmlDoc = parser.parseFromString(xmlString, "application/xml");

	// parser won't throw error with parsing, but will set parsererror
	if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
		throw new Error("Error parsing XML.");
	}

	// SBML is usually written with an unprefixed default namespace, but some
	// tools can prefix it (e.g. <sbml:species>). We'd like to find the
	// local name across any namespace, specified or not.
	// TODO I think rename byName, I'd like it more obvious it gets any elements by their tag name
	const byName = (root: Document | Element, localName: string): Element[] =>
		Array.from(root.getElementsByTagNameNS("*", localName));
	const first = (
		root: Document | Element,
		localName: string,
	): Element | null => byName(root, localName)[0] ?? null;
	// Is first really a required function to just adding [0] indexing potential null?
	// --- ROOT / MODEL METADATA ---
	const sbmlNode = first(xmlDoc, "sbml");
	if (!sbmlNode) {
		throw new Error(
			"This file doesn't look like an SBML model (no <sbml> element found).",
		);
	}
	const level = parseInt(sbmlNode.getAttribute("level") || "3", 10);
	// TODO check that assuming level 3 is good here
	const version = parseInt(sbmlNode.getAttribute("version") || "1", 10);
	// TODO check that assuming version 1 is good here

	const modelNode = first(xmlDoc, "model");
	const modelId = modelNode?.getAttribute("id") || "SBML_Model";
	const modelName = modelNode?.getAttribute("name") || modelId;

	const data: SBMLData = {
		modelId,
		modelName,
		level,
		version,
		compartments: new Map(),
		species: new Map(),
		reactions: new Map(),
		overview: {
			functionDefinitions: 0,
			rules: 0,
			events: 0,
			unitDefinitions: 0,
			parameters: 0,
			packages: [],
		},
	};

	// --- EXTRACT PACKAGES (INTO OVERVIEW) ---
	// SBML L3 has optional extension packages (declared as xmlns namespaces on the <sbml> root)
	for (const pkg of KNOWN_PACKAGES) {
		// Package namespace URIs look like http://www.sbml.org/sbml/level3/version1/fbc/version2
		const declared = Array.from(sbmlNode.attributes).some(
			(attr) =>
				attr.name.startsWith("xmlns") &&
				attr.value.includes(`/${pkg}/`),
		);
		if (declared) data.overview.packages.push(pkg);
	}

	// --- EXTRACT COMPARTMENTS ---
	for (const compartmentNode of byName(xmlDoc, "compartment")) {
		const id = compartmentNode.getAttribute("id");
		if (!id) continue;
		data.compartments.set(id, {
			id,
			name: compartmentNode.getAttribute("name") || id,
			species: [],
			isStub: false,
		});
	}

	// --- EXTRACT SPECIES ---
	byName(xmlDoc, "species").forEach((node, i) => {
		const id = node.getAttribute("id") || `Unknown_Species_${i}`;
		data.species.set(id, {
			id,
			name: node.getAttribute("name") || id,
			compartment: node.getAttribute("compartment") || "",
			reactantIn: [],
			productIn: [],
			modifierIn: [],
			isStub: false,
		});
	});

	// --- BUILD COMPARTMENT MEMBERSHIP (stubbing any compartment a species references
	//     but that was never declared) ---
	for (const sp of data.species.values()) {
		if (!sp.compartment) continue;
		let comp = data.compartments.get(sp.compartment);
		// TODO if the comp doesn't exist from .get ever, shouldn't we default to using our own definition? It feels bad that they could diverge
		if (!comp) {
			comp = {
				id: sp.compartment,
				name: sp.compartment,
				species: [],
				isStub: true,
			};
			data.compartments.set(sp.compartment, comp);
		}
		comp.species.push(sp.id);
	}

	// Ensure a species record exists;
	// isStub is true if a reaction references a species that's not
	// yet declared, so dead links aren't written into notes later.
	const ensureSpecies = (id: string): SpeciesData => {
		let spId = data.species.get(id);
		if (!spId) {
			spId = {
				id,
				name: id,
				compartment: "",
				reactantIn: [],
				productIn: [],
				modifierIn: [],
				isStub: true,
			};
			data.species.set(id, spId);
		}
		return spId;
	};

	// TODO Is it definitely the correct practice to assume a stoich of 1, when there is nothing there or nothing parse-able?
	const parseStoich = (ref: Element): number => {
		const rawStoich = ref.getAttribute("stoichiometry");
		if (rawStoich === null) return 1;
		const value = parseFloat(rawStoich);
		return Number.isNaN(value) ? 1 : value;
	};

	// --- EXTRACT REACTIONS & BUILD CROSS-LINKS ---
	// TODO the forEach may be classic TS/JS but to me it's complicated. Ideally the nameless callback of forEach would be named, ideally named something to imply what it's doing
	byName(xmlDoc, "reaction").forEach((rxnNode, i) => {
		const rxnId = rxnNode.getAttribute("id") || `Unknown_Reaction_${i}`;

		// SBML L2 defaults `reversible` to true when the attribute is absent; L3 requires it.
		const reversibleAttr = rxnNode.getAttribute("reversible");
		const reversible =
			reversibleAttr === null ? level < 3 : reversibleAttr === "true";

		const reaction: ReactionData = {
			id: rxnId,
			name: rxnNode.getAttribute("name") || rxnId,
			reversible,
			reactants: [],
			products: [],
			modifiers: [],
		};

		const extractRefs = (listName: string, refName: string): Element[] => {
			const listNode = first(rxnNode, listName);
			return listNode ? byName(listNode, refName) : [];
		};

		// Reactants
		for (const ref of extractRefs("listOfReactants", "speciesReference")) {
			const spId = ref.getAttribute("species");
			if (!spId) continue;
			reaction.reactants.push({
				species: spId,
				stoichiometry: parseStoich(ref),
			});
			ensureSpecies(spId).reactantIn.push(rxnId);
		}

		// Products
		for (const ref of extractRefs("listOfProducts", "speciesReference")) {
			const spId = ref.getAttribute("species");
			if (!spId) continue;
			reaction.products.push({
				species: spId,
				stoichiometry: parseStoich(ref),
			});
			ensureSpecies(spId).productIn.push(rxnId);
		}

		// Modifiers
		for (const ref of extractRefs(
			"listOfModifiers",
			"modifierSpeciesReference",
		)) {
			const spId = ref.getAttribute("species");
			if (!spId) continue;
			reaction.modifiers.push(spId);
			ensureSpecies(spId).modifierIn.push(rxnId);
		}

		data.reactions.set(rxnId, reaction);
	});

	// --- OVERVIEW COUNTS (constructs we don't draw as nodes) ---
	// TODO this seems nice to ready but very repeated, is a function worth it here?
	data.overview.functionDefinitions = byName(
		xmlDoc,
		"functionDefinition",
	).length;
	data.overview.events = byName(xmlDoc, "event").length;
	data.overview.unitDefinitions = byName(xmlDoc, "unitDefinition").length;
	data.overview.parameters = byName(xmlDoc, "parameter").length;
	data.overview.rules =
		byName(xmlDoc, "assignmentRule").length +
		byName(xmlDoc, "rateRule").length +
		byName(xmlDoc, "algebraicRule").length;

	return data;
}
