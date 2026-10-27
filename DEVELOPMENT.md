# Development notes

Context for anyone reading, maintaining or forking this plugin.

## How this was built

**This plugin was written with AI assistance** (via Claude Code, Opus 4.7 - Opus 5.5).
Specifically this included:

- AI edit of the Obsidian's starter plugin template to fit my own precise specification of how the plugin should look and behave.
- All design decisions were mine.
- Before the release of 1.0, I worked through the codebase line by line in a structured review. This was done to root out any opaque logic, hallucinated abstractions and non-human design patterns. The review found two real bugs claude didn't catch on generation, both fixed before 1.0; the ideas it raised that I chose not to act on are recorded in [TODO_archived.md](TODO_archived.md).
- There is a test suite covering the parser. It is deliberately small — see below.

This AI disclaimer is here as I value transparency in scientific tools and in research generally. While I enjoy elegant code, AI-generated code that works works.

## Orientation for a maintainer

Roughly 1,100 lines of TypeScript. A single SBML file flows through it in one direction:

| File                                             | Role                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `src/main.ts`                                    | Plugin shell. Lifecycle, command, ribbon icon, settings load/save. ~50 lines; a dispatcher.                  |
| `src/modals/sbml-modal.ts`                       | The import UI, and both routes in: local file, or BioModels download.                                        |
| `src/sbml-parser.ts`                             | `string → SBMLData`. **Pure, with zero Obsidian imports** — hence why it's the only part that's unit-tested. |
| `src/note-builder.ts`                            | `SBMLData` → markdown notes written to the vault. Holds the link-direction information.                      |
| `src/graph-bookmark.ts`                          | Writes `.obsidian/bookmarks.json` directly to create the graph bookmark.                                     |
| `src/settings.ts`, `src/modals/confirm-modal.ts` | Settings tab; the large-import confirmation.                                                                 |

Two important, arguably unintuitive points:

1. **Link direction matters for the graph view.** Obsidian draws a graph arrow _from_ the note holding a link _to_ the note linked. Reverse relationships are deliberately _not_ linked, because linking both ways makes every arrow meaningless. I wanted arrows to flow in an intuitive direction from reactants to reactions to products. If you add links, the graph's semantics may change. See `src/note-builder.ts:21-33`.
2. **Bookmarks are not public API.** `graph-bookmark.ts` reads and rewrites Obsidian's
   own config file. It is written pretty defensively to avoid affecting a user's pre-existing bookmarks. So a bookmark failure shouldn't prevent an import, and an unrecognised file is left alone rather than overwritten (losing a user's bookmarks is worse than losing the feature).

## On the test suite

The test suite covers `parseSBML` only, against one fixture model. That is because a silent bug could produce plausible-looking, but incorrect output, and it is pure, so it tests cheaply. The note-writing and bookmark code touch Obsidian's vault API, where a unit test mostly asserts that mocks were called.

If you extend the tests, the highest-value additions are probably SBML spec divergences, which are easy to get wrong and invisible when wrong:

- **L2 vs L3 `reversible` default** — absent means `true` in L2 and `false` in L3
- **Prefixed vs default namespaces** — `<species>` and `<sbml:species>` must behave identically; the parser uses `getElementsByTagNameNS("*", localName)` for this
- **Stoichiometry defaults** — absent means 1 per spec, but an unparseable value also currently becomes 1, which hides malformed input

## Known limitations at 1.0

Most limitations are necessary consequences of me wanting a minimal, interpretable network graph. But I appreciate how some biological models may be underrepresented.

- **Only the reaction-network structure is shown.** Kinetic laws, rules, events, parameters, units, SBO terms and annotations are counted and reported in the `_Model Overview` note but not represented. If a model's information is mostly encoded via its equations rather than reactions, it will produce a sparse graph.
- **SBML L3 packages are named, not parsed.** `fbc` flux bounds and gene associations, `comp` submodels, `layout` geometry — all unrepresented. Constraint-based and hierarchical models render only their core reaction network.
- **`comp` submodels may be silently flattened.** `getElementsByTagNameNS` searches the whole document, so species inside `<comp:modelDefinition>` are probably swept into the main model. **This is unverified** — it needs a real `comp` file to confirm.
- **Dynamic stoichiometry is flattened to 1.** L3 allows stoichiometry to be set by an assignment rule, and L2 has `<stoichiometryMath>`. Both are ignored.
- **L2 `layout` is not detected** — it used a namespace URI with no `/layout/` segment, so the package detection misses it.

## Ideas considered but not implemented

Plenty came up while building this that didn't make 1.0. Rather than list it here as if
it were outstanding work, it's recorded in [TODO_archived.md](TODO_archived.md) — what
each idea was, and why it was considered. **None of it is obligatory**, and whoever picks
this up should judge for themselves what's worth doing.

The short version: the real headroom is in **broader model coverage** — parsing the `fbc`
package for genome-scale metabolic models, checking whether `comp` submodels are being
silently flattened, and surfacing kinetic laws and annotations that are currently read
and then discarded.

Three things are out of scope by design rather than by omission: simulation, editing or
writing SBML, and any custom graph renderer. Obsidian's native graph view is the point.
