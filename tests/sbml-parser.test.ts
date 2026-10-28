/**
 * @vitest-environment jsdom
 *
 * Smoke tests for `parseSBML`.
 *
 * `parseSBML` is pure `string -> SBMLData` with zero Obsidian imports, so it needs only
 * a `DOMParser` — supplied here by jsdom. That purity is why it is the only unit-tested
 * part of the codebase; see DEVELOPMENT.md.
 *
 * The real-model expectations below were derived from the fixture XML independently of
 * the parser, so they check the parser rather than merely restating it.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSBML } from "../src/sbml-parser";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(here, "fixtures", name), "utf8");

/** Minimal SBML document, so each edge case states only what it is testing. */
function sbml(
	body: string,
	{ level = 3, version = 1 } = {},
): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level${level}/version${version}" level="${level}" version="${version}">
  <model id="test" name="Test model">${body}</model>
</sbml>`;
}

describe("a real model (BIOMD0000000010, Kholodenko2000 MAPK cascade)", () => {
	const data = parseSBML(fixture("BIOMD0000000010.xml"));

	it("reads the model identity and SBML level", () => {
		expect(data.modelId).toBe("BIOMD0000000010");
		expect(data.modelName).toContain("Kholodenko2000");
		expect(data.level).toBe(2);
		expect(data.version).toBe(4);
	});

	it("finds every compartment, species and reaction", () => {
		expect(data.compartments.size).toBe(1);
		expect(data.species.size).toBe(8);
		expect(data.reactions.size).toBe(10);
		expect([...data.compartments.keys()]).toEqual(["uVol"]);
	});

	it("parses a reaction's reactants, products, modifiers and reversibility", () => {
		const j0 = data.reactions.get("J0");
		expect(j0).toBeDefined();
		expect(j0?.reversible).toBe(false);
		// No stoichiometry attribute in the source, so the SBML default of 1 applies.
		expect(j0?.reactants).toEqual([{ species: "MKKK", stoichiometry: 1 }]);
		expect(j0?.products).toEqual([{ species: "MKKK_P", stoichiometry: 1 }]);
		expect(j0?.modifiers).toEqual(["MAPK_PP"]);
	});

	it("pushes cross-links back onto the species", () => {
		// MKKK_P is consumed by J1, produced by J0, and modifies J2 and J3.
		const mkkkP = data.species.get("MKKK_P");
		expect(mkkkP?.reactantIn).toEqual(["J1"]);
		expect(mkkkP?.productIn).toEqual(["J0"]);
		expect(mkkkP?.modifierIn).toEqual(["J2", "J3"]);
	});

	it("assigns every species to its compartment, in both directions", () => {
		expect(data.species.get("MKKK")?.compartment).toBe("uVol");
		expect(data.compartments.get("uVol")?.species).toHaveLength(8);
		for (const species of data.species.values()) {
			expect(species.isStub).toBe(false);
		}
	});

	it("counts the constructs it does not visualise", () => {
		expect(data.overview.unitDefinitions).toBe(1);
		expect(data.overview.parameters).toBe(22);
		expect(data.overview.rules).toBe(0);
		expect(data.overview.events).toBe(0);
		expect(data.overview.functionDefinitions).toBe(0);
		expect(data.overview.packages).toEqual([]);
	});
});

describe("the reversible default diverges between SBML levels", () => {
	const reaction = `
    <listOfSpecies><species id="A" compartment="c"/><species id="B" compartment="c"/></listOfSpecies>
    <listOfReactions>
      <reaction id="R1">
        <listOfReactants><speciesReference species="A"/></listOfReactants>
        <listOfProducts><speciesReference species="B"/></listOfProducts>
      </reaction>
    </listOfReactions>`;

	it("defaults to true in L2 when the attribute is absent", () => {
		const data = parseSBML(sbml(reaction, { level: 2, version: 4 }));
		expect(data.reactions.get("R1")?.reversible).toBe(true);
	});

	it("defaults to false in L3 when the attribute is absent", () => {
		const data = parseSBML(sbml(reaction, { level: 3, version: 1 }));
		expect(data.reactions.get("R1")?.reversible).toBe(false);
	});

	it("falls back to L3 behaviour when the level attribute is missing entirely", () => {
		// `level` is required by every SBML spec, so its absence means an invalid file.
		// The default matters anyway because it drives the reversible default above.
		const noLevel = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level3/version1">
  <model id="test">${reaction}</model>
</sbml>`;
		const data = parseSBML(noLevel);
		expect(data.level).toBe(3);
		expect(data.reactions.get("R1")?.reversible).toBe(false);
	});

	it("honours an explicit attribute regardless of level", () => {
		const explicit = reaction.replace('id="R1"', 'id="R1" reversible="false"');
		const data = parseSBML(sbml(explicit, { level: 2, version: 4 }));
		expect(data.reactions.get("R1")?.reversible).toBe(false);
	});
});

describe("species referenced but never declared", () => {
	const data = parseSBML(
		sbml(`
    <listOfSpecies><species id="A" compartment="c"/></listOfSpecies>
    <listOfReactions>
      <reaction id="R1" reversible="false">
        <listOfReactants><speciesReference species="A"/></listOfReactants>
        <listOfProducts><speciesReference species="Ghost"/></listOfProducts>
      </reaction>
    </listOfReactions>`),
	);

	it("is stubbed rather than dropped, so no link is left dangling", () => {
		const ghost = data.species.get("Ghost");
		expect(ghost).toBeDefined();
		expect(ghost?.isStub).toBe(true);
		expect(ghost?.productIn).toEqual(["R1"]);
	});

	it("does not mark declared species as stubs", () => {
		expect(data.species.get("A")?.isStub).toBe(false);
	});
});

describe("compartments referenced but never declared", () => {
	const data = parseSBML(
		sbml(`
    <listOfSpecies><species id="A" compartment="ghostCompartment"/></listOfSpecies>`),
	);

	it("is stubbed, so the species still has a compartment note to link to", () => {
		const compartment = data.compartments.get("ghostCompartment");
		expect(compartment).toBeDefined();
		expect(compartment?.isStub).toBe(true);
		expect(compartment?.species).toEqual(["A"]);
	});

	it("does not mark declared compartments as stubs", () => {
		const declared = parseSBML(
			sbml(`
    <listOfCompartments><compartment id="c" name="Cytosol"/></listOfCompartments>
    <listOfSpecies><species id="A" compartment="c"/></listOfSpecies>`),
		);
		expect(declared.compartments.get("c")?.isStub).toBe(false);
		expect(declared.compartments.get("c")?.name).toBe("Cytosol");
	});
});

describe("stoichiometry", () => {
	const withStoich = (value: string) =>
		parseSBML(
			sbml(`
    <listOfSpecies><species id="A" compartment="c"/><species id="B" compartment="c"/></listOfSpecies>
    <listOfReactions>
      <reaction id="R1" reversible="false">
        <listOfReactants><speciesReference species="A" stoichiometry="${value}"/></listOfReactants>
        <listOfProducts><speciesReference species="B"/></listOfProducts>
      </reaction>
    </listOfReactions>`),
		).reactions.get("R1")?.reactants[0]?.stoichiometry;

	it("defaults to 1 when the attribute is absent", () => {
		const data = parseSBML(
			sbml(`
    <listOfSpecies><species id="A" compartment="c"/></listOfSpecies>
    <listOfReactions>
      <reaction id="R1" reversible="false">
        <listOfReactants><speciesReference species="A"/></listOfReactants>
      </reaction>
    </listOfReactions>`),
		);
		expect(data.reactions.get("R1")?.reactants[0]?.stoichiometry).toBe(1);
	});

	it("reads an explicit value", () => {
		expect(withStoich("2")).toBe(2);
	});

	it("preserves zero, which is valid and must not fall back to 1", () => {
		expect(withStoich("0")).toBe(0);
	});
});

describe("namespaces", () => {
	it("parses a prefixed document identically to a default-namespace one", () => {
		const prefixed = `<?xml version="1.0" encoding="UTF-8"?>
<sbml:sbml xmlns:sbml="http://www.sbml.org/sbml/level3/version1" level="3" version="1">
  <sbml:model id="test" name="Test model">
    <sbml:listOfSpecies><sbml:species id="A" compartment="c"/></sbml:listOfSpecies>
    <sbml:listOfReactions>
      <sbml:reaction id="R1" reversible="false">
        <sbml:listOfReactants><sbml:speciesReference species="A"/></sbml:listOfReactants>
      </sbml:reaction>
    </sbml:listOfReactions>
  </sbml:model>
</sbml:sbml>`;
		const data = parseSBML(prefixed);
		expect(data.modelId).toBe("test");
		expect(data.species.size).toBe(1);
		expect(data.reactions.size).toBe(1);
		expect(data.species.get("A")?.reactantIn).toEqual(["R1"]);
	});

	it("names any declared SBML L3 package", () => {
		const withFbc = `<?xml version="1.0" encoding="UTF-8"?>
<sbml xmlns="http://www.sbml.org/sbml/level3/version1"
      xmlns:fbc="http://www.sbml.org/sbml/level3/version1/fbc/version2"
      level="3" version="1">
  <model id="test"/>
</sbml>`;
		expect(parseSBML(withFbc).overview.packages).toContain("fbc");
	});
});

describe("invalid input", () => {
	it("throws on malformed XML", () => {
		expect(() => parseSBML("<sbml><model></sbml>")).toThrow();
	});

	it("throws a readable error on valid XML that is not SBML", () => {
		expect(() =>
			parseSBML('<?xml version="1.0"?><root><child/></root>'),
		).toThrow(/SBML/i);
	});
});
