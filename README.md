# SBML Viewer

An Obsidian plugin that turns an SBML systems biology model into a network of linked notes, so you can explore its structure in Obsidian's graph view.

It aims to do one thing well: answer **"what does this model actually look like?"** Paste a BioModels ID, click the bookmark it creates, and you get a readable, colour-coded reaction network you can click through.

It is not a modelling tool, a simulator, or a diagram editor. Better tools exist for all of those.

## What you get

Importing a model creates a folder of notes:

| Note              | Tag                           | Contents                                                           |
| ----------------- | ----------------------------- | ------------------------------------------------------------------ |
| Species           | `#Species` (plus `#Modifier`) | Its compartment, and the reactions it is a reactant or modifier in |
| Reaction          | `#Reaction`                   | The reaction scheme as rendered LaTeX, and links to its products   |
| Compartment       | `#Compartment`                | The species it contains                                            |
| `_Model Overview` | `#ModelOverview`              | Counts, and an explicit list of anything the view does _not_ draw  |

It also adds a **graph bookmark** for the model, filtered to that model's folder with node colours already set up, collected under a "SBML Graph Views" bookmark group.

### Link direction is deliberate

Obsidian draws a graph arrow _from_ the note containing a link _to_ the note being linked, so links are written in one direction only:

- reactant species → reaction
- reaction → product species
- compartment → the species it contains

So `A + B → C` gives you `A → R1`, `B → R1`, `R1 → C`, and the arrows read the way the biology does.

Reverse relationships — which reactions _produce_ a species — are deliberately not linked, because that would draw a backwards arrow and muddy the graph. They're still there: Obsidian's **backlinks** pane shows them, and the reaction scheme states them outright.

## Installing

### With BRAT

1. Install the **BRAT** community plugin.
2. In BRAT's settings choose **Add beta plugin**.
3. Enter `Theo-BRN/SBML_Viewer`.
4. Enable **SBML Viewer** under **Settings → Community plugins**.

### Manually

Download `main.js` and `manifest.json` from the
[latest release](https://github.com/Theo-BRN/SBML_Viewer/releases) and put them in
`<vault>/.obsidian/plugins/sbml-viewer/`.

## Using it

Click the network icon in the ribbon, or run **Import SBML model** from the command palette.

- **From BioModels** — enter an ID such as `BIOMD0000000010` (curated) or `MODEL1602080000`
  (non-curated). The model is downloaded from the EBI BioModels database.
- **From a local file** — choose any `.xml` or `.sbml` file.

Models over 1000 notes ask for confirmation first, then show a progress counter while they're written. Large models work, but a several-thousand-node graph is inevitably dense.

## Settings

| Setting                                 | Default       | Effect                                                                                                                     |
| --------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Output folder                           | `SBML Models` | Where models are saved. Each import gets its own timestamped subfolder. Leave empty to use the vault root.                 |
| Create a graph bookmark for each import | On            | Adds a bookmark opening the graph filtered to that model, with colours configured. Turn off to leave your bookmarks alone. |

## Graph colours

The bookmark carries these colours with it, so normally there's nothing to set up. If you turn that
setting off, you can recreate them under **Graph view → Groups**:

| Query                | Colour           |
| -------------------- | ---------------- |
| `tag:#Species`       | `#0000FF` blue   |
| `tag:#Reaction`      | `#00C8C8` teal   |
| `tag:#Modifier`      | `#E6E619` yellow |
| `tag:#Compartment`   | `#8C8C8C` grey   |
| `tag:#ModelOverview` | `#E6823C` orange |

The bookmarked view filters to `tag:#Species OR tag:#Reaction`, leaving compartments out of the
graph — a compartment links to every species it holds, which makes it a hub that buries the
structure you're trying to see. The compartment notes still exist and are still browsable.

## Scope and limitations

This plugin shows the **structure** of a model: species, reactions, stoichiometry, reversibility,
modifiers and compartments. That's the whole ambition.

It deliberately does not show:

- kinetic laws and rate equations
- rules, events and function definitions
- initial concentrations, units and parameters
- SBO terms and RDF annotations

None of this is hidden from you. Whenever a model contains things the view doesn't draw, the
`_Model Overview` note lists them by name and count, so you always know what you're not looking at.

Two honest caveats:

- **Models built mainly from rules or ODEs rather than reactions will produce a sparse graph.** If
  the biology lives in the equations rather than in a reaction network, there isn't much structure
  here to draw.
- **SBML Level 3 packages** (`fbc`, `comp`, `layout`, `qual`, and others) are detected and reported
  in the overview note, but their contents aren't parsed. Constraint-based and hierarchical models
  will therefore render only their core reaction network.

Simulation, editing models, and exporting are out of scope by design.

## Direction

Plausible future additions, roughly in order of usefulness:

- kinetic laws and parameters on reaction notes
- richer species metadata (initial values, boundary conditions)
- SBO terms and annotation links out to other databases
- support for the `fbc` package, for genome-scale metabolic models

## Status

**Pre-1.0, and actively being developed.** It currently works as intended, but is being tested and tidied ahead of a 1.0 release.

One thing would help more than anything else: **it has been developed against a narrow set of models.** If you import something and the result looks wrong, sparse, or missing pieces, please [open an issue](https://github.com/Theo-BRN/SBML_Viewer/issues) with the BioModels ID or the file. Unusual models are exactly what's needed. Pull requests welcome too, though responses may not be quick.

Bookmarks are not part of Obsidian's public API, so the plugin writes the bookmark file directly.
One consequence: if you edit bookmarks by hand immediately after an import and before Obsidian
reloads, the Bookmarks plugin can overwrite the new entry. Re-importing recreates it.

## License

[MIT](LICENSE).
