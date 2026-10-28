# AGENTS.md — SBML Viewer

Guidance for AI agents and human contributors working on this codebase.

**Read [DEVELOPMENT.md](DEVELOPMENT.md) first.** It covers how this plugin was built,
its architecture, its known limitations, and which ideas were deliberately rejected.
This file covers what you must not break.

## What this plugin is

An Obsidian plugin that turns an SBML systems biology model into a network of linked
markdown notes, so the model's structure can be explored in Obsidian's **native** graph
view. It shows structure only: species, reactions, compartments, stoichiometry,
reversibility, modifiers.

It is not a simulator, a model editor, or a diagram renderer, and it does not draw
anything itself. Proposals that add simulation, editing, export or a custom renderer are
out of scope — see DEVELOPMENT.md.

## Commands

```bash
npm install
npm run dev      # watch build, unminified, with sourcemap — use this while developing
npm run build    # typecheck (tsc -noEmit) then production bundle, minified
npm run lint     # eslint, including eslint-plugin-obsidianmd
npm test         # vitest
```

`npm run build` must pass before any commit. `main.js` is **gitignored** on purpose —
it is a build artifact attached to GitHub releases, never committed.

## Architecture

One SBML file flows in one direction. Each file has a single job.

```
sbml-modal.ts  →  sbml-parser.ts  →  note-builder.ts  →  graph-bookmark.ts
  (get XML)        (XML → data)       (data → notes)      (configure graph)
```

| File                          | Responsibility                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/main.ts`                 | Plugin lifecycle only. Command, ribbon icon, settings tab, `loadData`/`saveData`. ~50 lines; keep it a dispatcher. |
| `src/modals/sbml-modal.ts`    | Import UI and both input routes: local file picker, BioModels download.                                            |
| `src/sbml-parser.ts`          | `string → SBMLData`. Pure. **No Obsidian imports.**                                                                |
| `src/note-builder.ts`         | `SBMLData` → markdown files in the vault. Owns the link-direction contract.                                        |
| `src/graph-bookmark.ts`       | Writes `.obsidian/bookmarks.json` to create the graph bookmark.                                                    |
| `src/settings.ts`             | Settings interface, defaults, settings tab.                                                                        |
| `src/modals/confirm-modal.ts` | The large-import confirmation prompt.                                                                              |

## Invariants — do not break these

These are the places where a plausible-looking "improvement" causes real damage. Each
one is deliberate. If you think one is wrong, say so and explain why rather than
changing it.

### 1. Link direction is the whole design

Obsidian draws a graph arrow **from** the note containing a link **to** the note being
linked. So links are written in one direction only:

- reactant species → reaction
- reaction → product species
- compartment → the species it contains

Reverse relationships are **deliberately not linked.** Adding them makes every arrow in
the graph bidirectional and therefore meaningless. This looks like missing information
and is not: Obsidian's backlinks pane shows the reverse, and the reaction scheme states
it outright. See `src/note-builder.ts:21-33`.

**Never add a link "for completeness".** It silently destroys the plugin's only output.

### 2. Never overwrite an unrecognised `bookmarks.json`

Bookmarks are not public Obsidian API, so `graph-bookmark.ts` reads and rewrites the
config file directly. If the file exists but fails `isBookmarksFile`, the function
**returns `false` and writes nothing.**

The standing rule: **a failed import is recoverable; a destroyed `bookmarks.json` is
not.** Where the plugin's own feature conflicts with the user's data, the feature loses.
Do not "simplify" that guard, and do not make `isBookmarksFile` stricter — a stricter
guard rejects valid files and costs the user their bookmark.

### 3. `sbml-parser.ts` must stay free of Obsidian imports

That purity is why it is the only unit-tested part of the codebase: it needs a
`DOMParser` and nothing else. Importing `obsidian` into it would require mocking the
whole API to test parsing. If the parser needs to report something, return it in
`SBMLData` and let a caller decide how to surface it.

### 4. Namespace-agnostic element lookup

`getElementsByTagNameNS("*", localName)` at `src/sbml-parser.ts:78` is required, not
verbose. SBML files use either a default namespace (`<species>`) or a prefixed one
(`<sbml:species>`), and both must parse identically. `getElementsByTagName` would break
on prefixed files, which do occur in the wild.

### 5. Three spec subtleties that look like bugs

- **`parseStoich` must not collapse to `||`** (`:191-196`). Zero is a valid
  stoichiometry, so the `Number.isNaN(value) ? 1 : value` return is load-bearing:
  writing `parseFloat(raw) || 1` would silently turn a legitimate `0` into `1`. (The
  `=== null` check on the raw attribute is about distinguishing *absent* from *present
  but empty*; it is the numeric fallback that protects zero.) Covered by a test.
- **The `reversible` default depends on SBML level** (`:202-205`). An absent `reversible`
  attribute means `true` in L2 and `false` in L3. The `level < 3` check is load-bearing;
  don't collapse it to a single default.
- **`level` defaults to 3 and that matters** (`:91`); `version` defaults to 1 and drives
  no logic. They are not symmetrical.

### 6. UI strings are already correct

`eslint.config.mts` disables `obsidianmd/ui/sentence-case` deliberately. Re-enabling it
flags 7 strings and **all 7 are false positives** — the rule cannot distinguish domain
acronyms and proper nouns from title case. `"Import SBML model"` and
`"Using BioModels ID"` are correct as written. Do not "fix" them.

## Obsidian platform rules

These come from Obsidian's Developer Policies and apply to any change:

- **Local and offline by default.** The only network calls go to the BioModels database
  (`BIOMODELS_HOSTS` in `src/modals/sbml-modal.ts`), on explicit user action, to fetch a
  model the user asked for by ID. Do not add others.
- **No telemetry, ever.** No analytics, no phoning home, no vault contents leaving the
  machine.
- **Clean up everything.** Use `this.register*` helpers for listeners and intervals so
  the plugin unloads without leaking.
- **`requestUrl` from `obsidian`, not `fetch`** — it bypasses CORS, which `fetch` cannot
  do from the renderer. Note `response.json` is a **property**, not a method.
- **Mobile must keep working.** `isDesktopOnly` is `false` and should stay false. No Node
  or Electron APIs in `src/` — use the vault adapter instead.
- **Keep startup light.** Nothing heavy in `onload`; all work happens on user action.
- **Stable command IDs.** Don't rename a released command ID; it breaks user hotkeys.

## Vault writes

- `vault.create` **throws** if the path exists; `adapter.write` overwrites silently.
  Prefer `create` and let it throw. Import folders are timestamped to the millisecond,
  so collisions are near-impossible.
- `getAbstractFileByPath` reads an in-memory cache that can lag behind disk, so
  check-then-create is a race. `ensureFolder` handles that by re-checking existence in
  the catch and rethrowing anything else.
- Errors are reported at the **top** of the call chain, where the UI lives.
  `note-builder.ts` throws; the modal catches and shows a `Notice`. Don't add `Notice`
  calls deep in the stack, and don't swallow errors to keep things tidy.

## Testing

`npm test` runs vitest against `tests/`. Only `parseSBML` is unit-tested, deliberately —
see DEVELOPMENT.md for why, and for the highest-value tests to add next.

If you change parsing behaviour, add a test. If you change note or bookmark writing,
smoke test it in a real vault: import a model and confirm the folder, notes, links and
graph bookmark all appear. No unit test catches a real Obsidian API behaviour change.

## Releases

1. Bump the version in `manifest.json`, `package.json`, `package-lock.json`,
   `versions.json` and `CITATION.cff`. `versions.json` maps plugin version → minimum
   Obsidian version.
2. Push commits, then tag. `.github/workflows/release.yml` fires on the tag, builds, and
   creates a **draft** release with `main.js`, `manifest.json` and `styles.css`.
3. The tag must **exactly match** `manifest.json`'s version, with **no `v` prefix** — the
   workflow checks this and fails the release otherwise. BRAT and the community store
   read the manifest, not the tag.
4. Publishing the draft is a manual step, and is what triggers Zenodo to mint a DOI.

## When in doubt

This project values being honest about its limits over appearing capable. The
`_Model Overview` note exists to list what the plugin _doesn't_ draw, and the README
states the scope plainly. If a change would make the plugin's output look more complete
than it is, that is a reason not to make it.
