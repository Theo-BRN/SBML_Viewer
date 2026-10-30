# SBML Viewer

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23803332.svg)](https://doi.org/10.5281/zenodo.23803332)

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

The arrows in the graph point one way on purpose — see [Link direction is deliberate](#link-direction-is-deliberate) if you want to know why.

## How to install

### Before you start

This is a plugin for **[Obsidian](https://obsidian.md)**, a free note-taking app, so you
need Obsidian itself before anything below will work:

1. Download and install Obsidian from [obsidian.md](https://obsidian.md). It's free, and
   runs on Windows, macOS, Linux, iOS and Android.
2. Open it and create a **vault** when prompted. A vault is just a folder on your
   computer where Obsidian keeps your notes — an empty one is perfect for trying this out.

Already use Obsidian? Go straight to Option 1.

### Option 1 — with BRAT (recommended)

BRAT is a small plugin that installs other plugins from GitHub and keeps them up to date, so you don't have to copy any files by hand.

1. **Install BRAT.** In Obsidian, open **Settings** → **Community plugins**. If you're in "Restricted mode", you'll need to press **Exit Restricted mode** to allow community plugins. Then select **Browse**, search for **BRAT**, and select **Install**, then **Enable**.
2. **Open BRAT's own settings.** Still in **Settings**, find **BRAT** in the list down the left-hand side and select it.
3. **Add this plugin.** Look for the **Beta plugin list** and select the **`+`** button.
4. **In the dialog that opens:**
    - Paste `Theo-BRN/SBML_Viewer` into the repository field.
    - **Select a version** using the dropdown — choose the latest version.
    - Select **Add plugin**.
5. **Turn it on.** Back in **Settings → Community plugins** press enable for
   **SBML Viewer**.

### Option 2 — manual install

Works without installing BRAT, but you'll need to repeat it for every new version.

1. Download `main.js` and `manifest.json` from the
   [latest release](https://github.com/Theo-BRN/SBML_Viewer/releases).
2. Open your vault's folder and create the folders `.obsidian/plugins/sbml-viewer/`
   inside it, then put both downloaded files there.
   `.obsidian` is hidden by default — in Finder press <kbd>⌘</kbd><kbd>⇧</kbd><kbd>.</kbd>
   to show hidden folders, and in Windows File Explorer tick **Hidden items** under the
   **View** menu.
3. Restart Obsidian, then enable **SBML Viewer** under **Settings → Community plugins**.

## How to use

Either select the network icon in the left-hand ribbon, or, using the command palette (<kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>P</kbd>) run **Import SBML model**. Both open a window with two ways to load a model:

- **From SBML file** — select **Choose file**, then pick any `.xml` or `.sbml` file
  from your computer.
- **Using BioModels ID** — type an ID such as `BIOMD0000000010` and select
  **Fetch and import**. The model is downloaded from EBI's [BioModels](https://www.biomodels.org), where you can also search for other models you're interested in.

The plugin then creates a folder of notes and a graph bookmark for the model. To view the graph for just this model, open the model's bookmark (under "SBML Graph Views"). You can then select any node to read that note.

A model of more than 1000 notes asks you to confirm first, then shows a counter while the notes are written. Large models do work, but a graph with several thousand nodes is inevitably dense — `MODEL1602080000`, for instance, produces around 4,500 notes.

## Settings

| Setting                                 | Default       | Effect                                                                                                                     |
| --------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Output folder                           | `SBML Models` | Where models are saved. Each import gets its own timestamped subfolder. Leave empty to use the vault root.                 |
| Create a graph bookmark for each import | On            | Adds a bookmark opening the graph filtered to that model, with colours configured. Turn off to leave your bookmarks alone. |

## Link direction is deliberate

Obsidian draws a graph arrow _from_ the note containing a link _to_ the note being linked, so links are written in one direction only:

- reactant species → reaction
- reaction → product species
- compartment → the species it contains

So `A + B → C` gives you `A → R1`, `B → R1`, `R1 → C`, and the arrows read the way the biology does.

Reverse relationships — which reactions _produce_ a species — are deliberately not linked, because that would draw a backwards arrow and muddy the graph. They're still there: Obsidian's **backlinks** pane shows them, and the reaction scheme states them outright.

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

Each of these, plus the ideas that were considered and rejected, is written up with its
reasoning in [TODO_archived.md](TODO_archived.md). None of it is planned work.

## Status

**Version 1.0.0 is released**, and is complete on its own terms — it does what it set out to do. It is not being actively extended, though it is maintained.

One thing would help more than anything else: **it has been developed against a narrow set of models.** If you import something and the result looks wrong, sparse, or missing pieces, please [open an issue](https://github.com/Theo-BRN/SBML_Viewer/issues) with the BioModels ID or the file. Unusual models are exactly what's needed. Pull requests welcome too, though responses may not be quick.

Bookmarks are not part of Obsidian's public API, so the plugin writes the bookmark file directly.
One consequence: if you edit bookmarks by hand immediately after an import and before Obsidian
reloads, the Bookmarks plugin can overwrite the new entry. Re-importing recreates it.

## How this was built

This plugin was written with AI assistance. [DEVELOPMENT.md](DEVELOPMENT.md) sets out
plainly what that means here — what was generated, which decisions were mine, and what
review it went through before release — alongside an orientation for anyone maintaining
or forking it, and the technical detail behind the limitations above.

## License

[MIT](LICENSE).
