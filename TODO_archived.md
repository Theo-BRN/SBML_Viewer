# Archive — ideas considered during development

While SBML Viewer 1.0 is complete on its own terms, there were some ideas that came up while building it and didn't make the 1.0 cut. This archive exists because maybe the thinking behind them is more useful than the ideas themselves: if you are extending this plugin, it may save you working out from scratch why something was or wasn't done, and where the awkward parts are. Whether any of it is worth doing is entirely your call!s

For what the plugin deliberately does _not_ do as a matter of scope, and for its known
limitations, see [DEVELOPMENT.md](DEVELOPMENT.md).

## Broader model coverage

The plugin reads the SBML core reaction network and nothing else, which might leave whole classes of model underserved.

- **Parse the `fbc` package.** Flux bounds and gene product associations, surfaced on
  reaction notes. Considered because: `fbc` is how genome-scale metabolic models carry
  their actual content, and those models are common. At 1.0 such a model renders only
  its bare reaction network, which is a thin view of it. Probably the single biggest
  increase in the number of models this tool is genuinely useful for.

- **Handle `comp` submodels properly**: the parser uses
  `getElementsByTagNameNS` which searches the whole document, so species inside
  `<comp:modelDefinition>` are likely swept into the main model and silently flattened.
  **This was never verified** — it needs a real `comp` file to confirm. If you have one,
  checking this is probably the most useful thing you could do. If confirmed, the options
  are to scope the search to the main `<model>` element, or to refuse `comp` files with a
  clear message rather than render something misleading.

- **Kinetic laws and parameters on reaction notes**: they're already
  counted and reported as present-but-not-drawn, so the information is being read and
  then discarded. Showing the rate law on the reaction note would cost little and would
  answer the obvious next question after "what reacts with what".

- **SBO terms and annotation links**: models carry RDF annotations
  pointing at UniProt, ChEBI, KEGG and so on. Turning those into outbound links would
  make species notes a jumping-off point into the wider literature, which fits how
  Obsidian is normally used.

- **Dynamic stoichiometry**: SBML L3 allows stoichiometry to be set by
  an assignment rule, and L2 has `<stoichiometryMath>`. Both are currently flattened to
  1, so a model using them is quietly misrepresented rather than reported as unsupported.
  Fixing it properly means evaluating rules; reporting it honestly is much cheaper.

## Import and interface

- **Select several files at once**: the hidden `<input type="file">`
  already supports it, so it's mostly a loop in the change listener. Also, the
  import folder name is timestamped to the millisecond, which is what keeps a batch from
  colliding — any coarser timestamp would need a counter.

- **Make the BioModels link in the modal clickable**: it's plain text
  at present. Obsidian's `createFragment` is the sanctioned way to put a real anchor in a
  setting description. Cosmetic, but it's the kind of thing people notice.

- **A mode showing all relationships instead of directional arrows.** _Why considered,
  and why rejected:_ you'd get self-contained notes listing every relationship, but you'd
  lose meaningful arrows, because linking both ways makes the graph bidirectional and the
  direction meaningless. It's a mode switch, not an addition — the two cannot both be
  true. I chose the graph as the primary artefact, and backlinks already recover the
  reverse relationships. If your priority is reading notes rather than reading the graph,
  you might reasonably choose differently.

## Robustness

- **More parser tests.** The 1.0 suite covers one fixture. The highest-value additions
  are the SBML spec divergences, which are easy to get wrong and invisible when wrong:
  the L2-vs-L3 `reversible` default, prefixed vs default namespaces, and stoichiometry
  defaults. Fixtures that would help: an L2 model, one with prefixed namespaces
  (`<sbml:species>`, rare in BioModels and may need hand-writing), a model with no
  declared compartments, and something near the several-thousand-note worst case.

- **Back up `bookmarks.json` before writing it**: the plugin writes
  Obsidian's bookmark file directly, since bookmarks aren't public API. 1.0 refuses to
  touch a file it doesn't recognise, which covers the case that actually caused data loss,
  but a copy-then-write or write-then-rename would cover every failure path. I didn't
  confirm whether the vault adapter's `rename` is atomic across platforms, so treat that
  as a candidate rather than a known-good pattern.

- **Validate the BioModels response and `data.json` instead of asserting their types.**
  Considered because: both are `as` assertions on data the plugin doesn't control. Both are
  currently safe, but by luck rather than by checking — the first because optional
  chaining absorbs a shape change, the second because settings are merged over defaults.
  A type guard would make that explicit rather than incidental.

## Internal structure - Potential for better readability.

These were things I wanted to tidy/make more readable while learning the codebase, sorry if they have made the codebase harder to read in the first place!

- `sbml-parser.ts` is one ~200-line function with five helpers nested inside it, while
  every other file is split into module-level functions. It's the outlier, and could be
  broken into `extractSpecies` / `extractReactions` / `countOverview` and so on. Not done
  for 1.0 because it changes nothing a user sees and restructuring parsing logic is the
  easiest way to introduce a silent bug so I avoided it.
- The file input's change listener uses `void` on an un-awaited promise where an `async`
  listener would read more directly.

## Decided against on principle

Not oversights. These would make it a different tool, and better tools already exist.

- Simulation of any kind
- Editing or writing SBML
- Export to other formats
- A custom graph renderer — Obsidian's native graph view is the entire point
