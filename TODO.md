# TODO

Work queued while going through `docs/CODEBASE-TOUR.md`. Ordered — 1 unblocks 2 and 4.

**Correctness bugs: 6.3 (data loss — highest priority) and 4.1.** Everything else is
testing, structure or product decisions.

**Standing principle:** never destroy the user's data. A failed import is recoverable;
a destroyed `bookmarks.json` is not. Where the two conflict, the plugin gives up its own
feature rather than risk the user's files.

---

## 0. How to apply these changes

Most items below are edits to working code. The risk isn't writing the new version —
it's applying it partially, or breaking something nothing checks. Be thorough:

- **Tests first.** Item 1 before items 2, 4.3 and anything else that moves logic
  around. A refactor without tests is a rewrite you can't verify.
- **Fix the pattern, not the line.** Several items cite one `file:line` as an example.
  Before applying, grep for the same pattern elsewhere — a bare `catch { }`, an `as`
  where a type guard belongs, a helper nested for no reason. Fixing only the flagged
  instance leaves the codebase inconsistent, which is worse than leaving it alone.
- **One item per commit.** Keeps `git bisect` useful and makes each change reviewable
  on its own. Don't bundle a refactor with a behaviour change — if something breaks,
  you want to know which half did it.
- **Run all three after every item:** `npm run build` (typecheck + bundle),
  `npm run lint`, `npm test` once it exists. Green on all three is the bar.
- **Smoke test in Obsidian for anything touching the vault.** Items 4.1 and 4.3 call
  `vault.create` / `createFolder`; no unit test will catch a real Obsidian API change
  in behaviour. Import a real model, confirm the folder, notes, links and graph
  bookmark all appear.
- **Check the whole chain when changing a shape.** `SBMLData` is consumed by
  `note-builder.ts` and `graph-bookmark.ts`; a field rename has to land in all three.
  The typechecker catches most of this, but not string-built content like frontmatter
  tags or the graph search query (`graph-bookmark.ts:96`), which are just text.

---

## 1. Tests for `parseSBML`

**Why first:** there are currently no tests at all. `npm run build` typechecks and
`npm run lint` runs ESLint, but nothing verifies that a given SBML file produces the
right notes. Item 2 is a refactor of the most intricate file in the codebase, and
refactoring untested parsing logic is how silent bugs get in — the output would still
*look* fine.

`parseSBML` is the obvious first target: pure `string → SBMLData`, zero Obsidian
imports, no side effects. It needs only a `DOMParser`, available via jsdom.

- [ ] Add a test runner (vitest is the least-friction option with esbuild/TS already
      in place) and a `test` script in `package.json`
- [ ] Add jsdom so `DOMParser` exists outside Electron
- [ ] Collect sample models in `tests/fixtures/` — see below
- [ ] Write tests covering:
  - [ ] species / reaction / compartment counts for a known model
  - [ ] cross-links: `reactantIn` / `productIn` / `modifierIn` populated correctly
  - [ ] **prefixed vs default namespace** — `<species>` and `<sbml:species>` must give
        identical results (`sbml-parser.ts:77`)
  - [ ] **L2 vs L3 `reversible` default** — absent attribute means `true` in L2,
        and `false` in L3 (`sbml-parser.ts:198-201`)
  - [ ] **stubbing** — a reaction referencing an undeclared species produces a
        species record with `isStub: true`, and no dead link (`sbml-parser.ts:170`)
  - [ ] stoichiometry: absent → 1, non-numeric → 1 (`sbml-parser.ts:187-192`)
  - [ ] malformed XML throws; a non-SBML XML file throws the friendly
        "doesn't look like an SBML model" error (`sbml-parser.ts:69`, `:84`)
  - [ ] overview counts for rules / events / parameters
- [ ] Add `npm test` to `.github/workflows/lint.yml`

### Sample models to line up

Aim for coverage of the *shapes* that break parsers, not just more files.

- [ ] A small, well-behaved L3 model — the baseline (e.g. `BIOMD0000000010`)
- [ ] An L2 model — for the `reversible` default divergence
- [ ] One using **prefixed namespaces** (`<sbml:species>`) — rarer in BioModels, may
      need to be hand-written from an existing file
- [ ] A large model, near the 4,500-note worst case — check parse time is sane
- [ ] A model with **no compartments declared** but species referencing one — exercises
      compartment stubbing (`sbml-parser.ts:151-166`)
- [ ] An `fbc` model — see item 3
- [ ] A `comp` model with embedded `<modelDefinition>` — see item 3
- [ ] A deliberately broken file (truncated XML) for the error path

Keep fixtures small where possible; trim large models by hand rather than committing
multi-MB files.

---

## 2. Decompose `sbml-parser.ts`

`parseSBML` is a single ~200-line function with five helpers nested inside it. Every
other file in the project is already decomposed into named module-level functions
(`note-builder.ts`, `graph-bookmark.ts`) — this file is the outlier.

**Do this only once item 1 is green.**

### Free wins — pure, capture nothing, straight cut-and-paste to module level

- [ ] `byName` (`:77`)
- [ ] `first` (`:79`)
- [ ] `parseStoich` (`:187`)

### Needs a parameter added, but worth it

- [ ] `ensureSpecies` (`:170`) — currently closes over `data`; pass the species Map in
- [ ] `extractRefs` (`:212`) — currently closes over `rxnNode`; pass it in

### Then extract the phases

- [ ] `detectPackages(sbmlNode): string[]` (`:114-123`)
- [ ] `extractCompartments(xmlDoc): Map<string, CompartmentData>` (`:126-135`)
- [ ] `extractSpecies(xmlDoc): Map<string, SpeciesData>` (`:138-149`)
- [ ] `assignCompartmentMembership(species, compartments)` (`:151-166`)
- [ ] `extractReactions(xmlDoc, level, species): Map<string, ReactionData>` (`:195-251`)
      — note this **mutates** `species` to push the cross-links; making that visible in
      the signature is part of the point
- [ ] `countOverview(xmlDoc): ModelOverview` (`:253-264`)
- [ ] `parseSBML` becomes an orchestrator that calls the above in order

### Small cleanup while in there

- [ ] Hoist the `xmlns` filter out of the `KNOWN_PACKAGES` loop (`:115-123`). It
      doesn't depend on `pkg`, so it currently re-scans every attribute 7×. Name the
      intermediate list `namespaceUris`.
- [ ] Consider a `console.warn` in `first()` when more than one match is found. Not a
      behaviour change — a diagnostic to surface surprises while testing against
      unfamiliar real-world files.

---

## 3. Model coverage: what's hidden, and how we say so

**Principle (questionnaire 8a):** no part of a model should be silently absent. If we
don't draw it, we say so.

### Already done — don't rebuild

- The overview note has a **"Not visualised in this view"** section
  (`note-builder.ts:204-210`), listing function definitions, rules, events, parameters,
  unit definitions and detected SBML packages.
- Counts are collected in `sbml-parser.ts:253-264`, packages at `:114-123`.
- Stub species/compartments are flagged inline in their own notes
  (`note-builder.ts:129`, `:162`).

### The actual gap — unknown packages are silently missed

`KNOWN_PACKAGES` (`sbml-parser.ts:55-63`) is a hardcoded list of seven: `fbc`, `comp`,
`layout`, `qual`, `multi`, `distrib`, `groups`. A model using anything else — `render`,
`spatial`, `arrays`, `req`, `dyn` — is **not detected and not reported**. That directly
contradicts the principle above: the user is told "nothing is hidden" when something is.

- [ ] Detect *any* `xmlns:*` whose URI looks like an SBML L3 package, rather than
      matching against a fixed list. Report unrecognised ones by prefix.
- [ ] Decide the wording for a package we can name but not interpret. Current text says
      only "SBML packages: fbc" — it should be clearer that the package's *contents*
      (flux bounds, gene associations, submodels) are not represented at all.

### Decisions still open

- [ ] **Should `fbc` be parsed for v1, or only named?** (questionnaire 2b) The code to
      change is `sbml-parser.ts:114-123` plus new extraction. Parsing flux bounds and
      gene product associations is a meaningful scope increase — probably v2.
- [ ] **`comp` and embedded models.** `getElementsByTagNameNS("*", "species")` searches
      the whole document recursively, so species inside `<comp:modelDefinition>` are
      likely swept into the main model, silently flattening submodels. **Unverified** —
      needs a real `comp` file to confirm (see item 1 fixtures). If confirmed, either
      scope the search to the main `<model>` element or refuse `comp` files with a clear
      message.
- [ ] **Should the import Notice mention hidden constructs**, or is the overview note
      enough? Currently the success toast only reports species and reaction counts
      (`sbml-modal.ts:134-136`). Leaning: keep the toast short, but consider linking
      straight to the overview note.
- [ ] **L2 `layout` won't be detected** — it used the URI
      `http://projects.eml.org/bcb/sbml/level2`, which has no `/layout/` segment.
      Probably not worth fixing given the BioModels/L3 focus, but note it rather than
      leave it as an unknown.

---

## 4. `note-builder.ts`

### 4.1 ⚠️ BUG — `ensureFolder` swallows every error (`:225-229`)

The `catch { }` block is bare. Its comment claims the cause is "created by something
else in the meantime", but nothing verifies that — an invalid folder name, a
permissions problem or a full disk are silently ignored too.

The race it describes **is** real (`getAbstractFileByPath` reads Obsidian's in-memory
cache, which can lag behind disk, and sync or another plugin can create the folder in
between), so the handling shouldn't just be deleted. It should be narrowed.

Failure chain today, if folder creation genuinely fails:

1. `ensureFolder` returns normally — it's `Promise<void>`, there's no success signal
2. all ~N notes get built and every `vault.create` fails (`:99`), incrementing `failed`
3. user sees **"N note(s) could not be created."** (`:112`)
4. `folderPath` is returned anyway (`:115`) — a non-null success value
5. a graph bookmark is written pointing at a folder that doesn't exist
   (`sbml-modal.ts:122`)
6. user *also* sees **"Imported <model>: N species, M reactions."** (`sbml-modal.ts:134`)

Two contradictory notices and a dead bookmark.

- [ ] Narrow the catch — re-check existence rather than string-matching the error
      message, which is undocumented and may change between Obsidian versions:
      ```ts
      } catch (error) {
          // Tolerate the race: if it exists now, something else created it.
          // Anything else is a real failure and must not be silent.
          if (!app.vault.getAbstractFileByPath(current)) throw error;
      }
      ```
- [ ] No new error handling needed at the call sites — `importLocalFile`
      (`sbml-modal.ts:98-103`) and the BioModels handler (`:56-66`) already catch and
      show `describeError`. One honest failure replaces two contradictory notices.
- [ ] Test: `ensureFolder` against an invalid folder name should **throw**, not
      silently continue. Good second test after `parseSBML`.
- [ ] Separately, consider whether `createNetworkNotes` should return `null` (or throw)
      when every write failed, rather than reporting success.

### 4.2 Readability — `ensureFolder` guard clause (`:224`)

Preference call, no behaviour change. Swap the early `continue` for a positive block,
which restates the function's own name (`if it doesn't exist, create it`):

```ts
if (!app.vault.getAbstractFileByPath(current)) {
    try { ... } catch { ... }
}
```

Trade-off: one level deeper nesting, in exchange for reading more directly. Decided in
favour of readability while the loop stays this small.

- [ ] Apply, and revisit if the loop ever grows more steps

### 4.3 Decompose `createNetworkNotes` (`:34-116`)

At ~82 lines it's the largest function in the file by a distance — the note *templates*
around it (`buildSpeciesNote` etc.) are already small and readable. Splitting into
plain module-level functions, same file, no new files needed:

- [ ] `confirmLargeImport(app, data): Promise<boolean>` — `:39-50`
- [ ] `resolveModelFolder(baseFolder, modelId): string` — `:52-58`
- [ ] `buildAllNotes(data, folderPath): PendingNote[]` — `:64-90`
- [ ] `writeNotes(app, notes): Promise<number>` — `:92-113`, returns the failure count
- [ ] `createNetworkNotes` becomes a ~15-line orchestrator

**Decided against: making these methods on `SBMLData`.** `SBMLData` is an interface, so
it would have to become a class, and the class would then need to import `App` from
`obsidian` — destroying the property that makes `sbml-parser.ts` trivially testable
(zero Obsidian imports, pure `string → SBMLData`). Passing `data` as a parameter keeps
the parser clean and the dependency explicit. See item 1.

---

## 5. Build config

### 5.1 ⚠️ `lib` is understated — the build passes by accident (`tsconfig.json:19`)

```json
"lib": ["DOM", "ES5", "ES6", "ES7"]
```

`ES7` is TypeScript's alias for **ES2016**. But `Object.entries` (`note-builder.ts:239`)
is **ES2017**. Verified in isolation with exactly this lib list:

```
error TS2550: Property 'entries' does not exist on type 'ObjectConstructor'.
Try changing the 'lib' compiler option to 'es2017' or later.
```

`npm run build` currently passes only because `node_modules/@types/node/index.d.ts:28`
contains `/// <reference lib="es2020" />`, and there's no `types` field in the tsconfig,
so every `@types/*` package is auto-included. A **dev** dependency — present only for
the `.mjs` build scripts — is silently supplying the lib the source actually needs.

Remove `@types/node`, bump it, or add `"types": []`, and the build breaks on code that
has been fine for months.

**Confirmed in practice:** VSCode's bundled TypeScript 6.0.3 flags this; the workspace's
5.8.3 does not. TS 6 appears to no longer let a `@types` package expand an explicitly
declared `lib` — the stricter, more correct behaviour. This will bite on the next
TypeScript upgrade regardless.

- [ ] Set `"lib": ["DOM", "ES2018"]` — supersedes ES5/ES6/ES7 (they're cumulative) and
      matches esbuild's `target: "es2018"` (`esbuild.config.mjs:36`). Safe given
      `minAppVersion: 1.4.0`.
- [ ] Consider `"target": "ES2018"` too, so tsconfig and esbuild agree rather than
      declaring ES6 while shipping es2018.
- [ ] Consider `"types": ["node"]` to make the dependency explicit instead of implicit.
- [ ] Re-run `npx tsc -noEmit -skipLibCheck` after — should still pass, now honestly.

### 5.2 Pin the editor's TypeScript to the workspace version

Editor and CI should agree. VSCode defaults to its own bundled TypeScript, which drifts
ahead of the project and produces errors CI never sees (exactly what happened above).

- [ ] Add `.vscode/settings.json` with
      `{ "typescript.tsdk": "node_modules/typescript/lib" }`
- [ ] Note this only pins the *editor*; 5.1 is still the real fix

---

## 6. `graph-bookmark.ts`

### 6.1 Drop the type assertion in `isBookmarksFile` (`:141-147`)

Cosmetic, no behaviour change. Current version needs an `as` to make the property
access legal, because after `typeof value === "object" && value !== null` TypeScript
narrows `value` to `object`, which has no known properties:

```ts
Array.isArray((value as { items?: unknown }).items)
```

The `in` operator is both a runtime check *and* a narrowing operator, so it removes the
assertion entirely:

```ts
function isBookmarksFile(value: unknown): value is BookmarksFile {
	return (
		typeof value === "object" &&
		value !== null &&
		"items" in value &&
		Array.isArray(value.items)
	);
}
```

Needs TS 4.9+ for `in`-narrowing on `unknown`; we're on 5.8.3. Verified this compiles
under `--strict`.

Worth doing because it removes an `as` from a function whose entire job is to *avoid*
unchecked assertions — the assertion is load-bearing nowhere and slightly undercuts
the point of the guard.

- [ ] Apply
- [ ] Per item 0, grep for the same `(value as { … }).prop` shape elsewhere before
      considering this done

### 6.2 Note: the guard is deliberately shallow

Not a task — context so nobody "fixes" it later. `isBookmarksFile` only checks that
`items` is an array; it does not validate the items themselves. That's fine because
`findOrCreateGroup` (`:123-128`) re-checks each item defensively at the point of use,
and the index signature at `:30` exists specifically to preserve fields this plugin
doesn't model. Deep validation of a file we don't own would be both expensive and
counterproductive.

### 6.3 ⚠️⚠️ BUG — an unrecognised `bookmarks.json` gets silently overwritten (`:61-75`)

**Highest priority item in this file. This destroys user data.**

```ts
let bookmarks: BookmarksFile = { items: [] };
if (await adapter.exists(path)) {
	const parsed: unknown = JSON.parse(await adapter.read(path));
	if (isBookmarksFile(parsed)) bookmarks = parsed;   // ← if false: falls through
}
// ...no else, no return — execution continues to:
await adapter.write(path, JSON.stringify(bookmarks, null, 2));
```

If `bookmarks.json` exists and parses as **valid JSON** but fails `isBookmarksFile`,
`bookmarks` stays `{ items: [] }` and gets written over the top. Every bookmark the user
had is gone, silently, and the plugin reports success.

Note the asymmetry: if `JSON.parse` *throws*, the outer `catch` (`:77`) saves us and no
write happens. It is specifically **valid JSON of an unexpected shape** — `{}`, `[]`, a
future Obsidian format change, a partially-synced file — that triggers the loss.

The file's stated principle (`:43-51`) is "a bookmark failure must never take down an
import." That's honoured. "Must never destroy user data" is not.

- [ ] **Bail out rather than overwrite.** If the file exists but isn't recognised, do
      not touch it:
      ```ts
      if (await adapter.exists(path)) {
          const parsed: unknown = JSON.parse(await adapter.read(path));
          if (!isBookmarksFile(parsed)) {
              console.error(
                  "bookmarks.json has an unexpected shape — leaving it untouched.",
              );
              return false;   // caller already shows a soft warning
          }
          bookmarks = parsed;
      }
      ```
      The user loses the bookmark feature for that import and keeps every bookmark they
      had. Correct trade. `addModelGraphBookmark` already returns `boolean` and
      `sbml-modal.ts:127` already handles `false`, so no caller changes are needed.
- [ ] **Consider a backup before writing**, covering every failure path rather than just
      this one — copy to `bookmarks.json.bak` before the write, or write to a temp path
      and rename. Worth checking what `DataAdapter` actually guarantees; I haven't
      confirmed whether its `rename` is atomic across platforms, so treat "write then
      rename" as a candidate rather than a known-good pattern.
- [ ] **Test:** given an existing `bookmarks.json` containing `{}` or `[]`, the file must
      be byte-identical afterwards and the function must return `false`.
- [ ] Per item 0, audit every other `adapter.write` / overwrite in the codebase against
      the standing principle. Currently this is the only one — `note-builder.ts` uses
      `vault.create`, which **throws** rather than overwriting if a file exists, and the
      timestamped folder name (`note-builder.ts:53-54`) makes collisions near-impossible.
      That path is already safe; confirm it stays that way.

---

## 7. `modals/sbml-modal.ts`

All from the Stage 5 review. None are bugs — 7.1–7.3 are readability/simplification,
7.4 is a feature. **All after tests (item 1).**

### 7.1 Drop the `void` by making the listener `async` (`:42-49`)

`void this.importLocalFile(file)` exists only because the `change` listener isn't
`async`, so it can't `await`. Making the listener `async` removes the need for it:

```ts
fileInputButton.addEventListener("change", async () => {
	const file = fileInputButton.files?.[0];
	fileInputButton.value = "";
	if (file) await this.importLocalFile(file);
});
```

Safe **specifically because** `importLocalFile` (`:98-105`) has its own `try`/`catch` and
never rejects — so there's no floating rejection for anyone to miss. If that ever changes,
the `void` question comes back.

- [ ] Apply
- [ ] Per item 0, check for other `void somePromise()` uses first — currently this is the
      only one

### 7.2 Make the BioModels link clickable (`:66`)

`setDesc` renders a plain string, so the URL is inert text. It also accepts a
`DocumentFragment`:

```ts
.setDesc(
	createFragment((f) => {
		f.appendText("Choose a model from ");
		f.createEl("a", {
			text: "biomodels.org",
			href: "https://www.biomodels.org",
		});
		f.appendText(".");
	}),
)
```

- [ ] Apply
- [ ] Check the link actually opens externally from inside a modal on desktop **and**
      mobile before considering it done

### 7.3 Drop `ebi.ac.uk` from `BIOMODELS_HOSTS` (`:10-14`)

**Verified by request, 2026-08:**

| URL | redirects | result |
|---|---|---|
| `ebi.ac.uk/biomodels/model/files/…` | **2** | → `biomodels.org`, 200 |
| `biomodels.org/model/files/…` | **0** | 200 |

The original comment's claim about the redirect direction was right, but the consequence
was missed: **EBI terminates at `biomodels.org`, so it is not a fallback.** If
`biomodels.org` is down, the EBI path is down too — it provides zero resilience while
adding two round trips to every request, and it is currently tried **first**.

Confirmed by testing: commenting out the EBI entry doesn't break imports.

- [ ] Reduce to a single host, `https://www.biomodels.org`
- [ ] The `for (const host of BIOMODELS_HOSTS)` loop (`:175`) can then collapse — keep the
      *filename* fallback loop (`:188`), which is a genuine fallback and unrelated
- [ ] Update the comment: record that EBI redirects here, so nobody "helpfully" re-adds it
- [ ] Sanity-check a couple of `MODEL…`-style ids as well as `BIOMD…`, since only the
      latter was tested

### 7.4 FEATURE — allow selecting multiple files (`:36-49`)

Currently one model per import: the input has no `multiple` attribute, so `files` holds at
most one entry and `?.[0]` takes it.

- [ ] Add `multiple: true` to the input's `attr`
- [ ] Loop over `files` rather than taking `[0]`
- [ ] Decide the UX: one timestamped folder per model (consistent with today), or one
      shared parent folder for the batch?
- [ ] Decide failure behaviour: if model 3 of 5 fails, do the rest continue? (Consistent
      with `note-builder.ts` per-note handling, they should.)
- [ ] The large-model confirm (`note-builder.ts:42`) fires **per model** — with 5 models
      that's 5 dialogs. Probably wants a combined up-front count instead.
- [ ] Progress notice will need a model-level counter as well as the note-level one

### 7.5 Improve the `.value = ""` comment (`:45`)

The line is necessary but the comment undersells it, enough that a reader (twice) tested
it and concluded it did nothing. It only has an effect **within one modal session**, which
can only happen after a *failed* import — since `importModel` closes the modal on success
(`:138`) and each ribbon click builds a fresh input.

Verified repro: pick an invalid `.xml` → error notice, modal stays open → pick the *same*
file again → without the line, nothing happens at all.

The scenario that matters: a user gets a parse error, fixes the file in another editor, and
re-picks the same path. Without this, their corrected file is silently ignored.

- [ ] Reword along the lines of:
      ```ts
      // Clearing the value means re-picking the SAME path still fires `change`.
      // Only reachable after a failed import (the modal stays open), e.g. the user
      // fixes the file externally and retries with the same filename.
      ```

### 7.6 Pin the BioModels API assumptions to its published reference (`:147-148`)

The URL shapes (`/model/files/{id}?format=json`, `/model/download/{id}?filename=…`) and the
response shape (`{ main: [{ name }] }`) were derived from observed behaviour, not from
documentation. Partially confirmed: a live request to `/model/files/BIOMD0000000010?format=json`
returns 200 with that shape.

- [ ] Find the official BioModels REST reference (EBI publishes one) and link it in a
      comment above `BIOMODELS_HOSTS`
- [ ] Confirm `main[0]` is genuinely "the SBML file" and not just "the first file" — if a
      model has several main files, are we picking the right one?
- [ ] Confirm whether `_url.xml` is a documented convention or folklore (`:182`). If it's
      folklore, say so in the comment rather than implying it's specified.

---

## 8. Code review follow-ups (from the Stage 2–5 pass)

Everything here came out of inline `TODO` comments in the source. Grouped by verdict.

### 8.1 `sbml-parser.ts` — clarity (do alongside item 2)

- [ ] **Rename `byName`** (`:78`). It doesn't search by *name*, it searches by **local
      name across any namespace** — which is the whole point and the current name hides
      it. Suggest `byLocalName` / `firstByLocalName`, matching the XML term (local name vs
      qualified name).
- [ ] **Replace `.forEach()` with `for…of`** (`:144`, `:205`). Removes the anonymous
      callback entirely, and the file is currently **inconsistent** — compartments already
      use `for…of` (`:132`) while species and reactions use `forEach`. Index via
      `.entries()` where needed:
      ```ts
      for (const [i, rxnNode] of byName(xmlDoc, "reaction").entries()) { … }
      ```
      Bonus: `continue` works naturally, and `await` becomes possible if ever needed.
- [ ] **Add a `countOf` helper for the overview block** (`:264-275`). Six near-identical
      lines collapse to:
      ```ts
      const countOf = (localName: string) => byName(xmlDoc, localName).length;
      data.overview.events = countOf("event");
      data.overview.rules =
          countOf("assignmentRule") + countOf("rateRule") + countOf("algebraicRule");
      ```
      Folds naturally into the `countOverview()` extraction in item 2.
- [ ] **Extract a `CompartmentData` factory** (`:162`). See 8.2 — the *divergence* worry is
      unfounded, but the **duplicated object construction** is real.

### 8.2 `sbml-parser.ts` — correctness questions

- [ ] **`level` defaulting to 3 (`:92`) is load-bearing; `version` defaulting to 1 (`:94`)
      is not.** `level` drives the `reversible` default at `:211` (`level < 3`). A file
      that is genuinely L2 but missing the attribute would get `reversible: false` where
      the spec says `true` — a silent semantic error that shows up as a one-way arrow in
      the graph. `version` is stored and printed but drives **no logic**, so its default is
      harmless.
      Both attributes are **required** by every SBML spec, so their absence means the file
      is already invalid. Proposal: keep the defaults, but `console.warn` when either is
      missing rather than defaulting silently — consistent with "nothing hidden".
- [ ] **Stoichiometry defaulting to 1 (`:196-201`) — two cases, only one is fine.**
  - Attribute **absent** → 1 is the SBML-specified default. Correct, no change.
  - Attribute **present but unparseable** → currently also silently 1. That's malformed
    input being hidden. Should warn.
  - ⚠️ **Known limitation worth surfacing:** SBML L3 allows stoichiometry to be *dynamic*
    (set by an assignment rule referencing the `speciesReference` id), and L2 has
    `<stoichiometryMath>`. Both are silently flattened to 1 here. That belongs in the
    overview note's "Not visualised" section (see item 3), not buried.
- [ ] **Test all of the above** — these are pure-parser behaviours, ideal for item 1.

### 8.3 `note-builder.ts`

- [ ] **Log write failures to console** (`:100-105`). The `catch` is bare, so a failed note
      gives you a count and nothing else — no path, no reason. Same principle as 4.1:
      ```ts
      } catch (error) {
          console.error(`Could not create note: ${note.path}`, error);
          failed++;
      }
      ```
      Consider also collecting the failed paths and naming the first few in the Notice.
- [ ] **Neater timestamp** (`:54`). Current output is
      `2026-08-05T14-23-45-123Z` — filesystem-safe but ugly in a folder name.
      ⚠️ **Constraint:** it must stay unique per import. Dropping milliseconds is fine for
      manual use but risks collisions under **7.4 (multi-file import)**, where several
      models could land in the same second. Either keep sub-second precision or add a
      counter. Decide these two together.

---

## 9. Features — post-release

Not needed for a release version. Listed so they aren't lost.

### 9.1 Multiple file selection

See **7.4** — kept there because it's a small change to that file, but it is a feature, not
a fix.

### 9.2 Setting: full link lists instead of directional arrows (`note-builder.ts:34`)

An option to abandon the link-direction contract (`note-builder.ts:21-33`) in favour of
listing **all** relationships in every note — reactions listing reactants *and* products,
species listing every reaction they appear in.

**The trade is explicit and unavoidable:** you gain complete, self-contained notes; you
lose correct arrows, because linking both ways makes the graph bidirectional and the
direction meaningless. This is a **mode switch, not an addition** — the two cannot both
be true at once.

- [ ] Decide whether the graph is the primary artefact (current assumption, questionnaire
      6c) or whether note completeness can win when the user asks for it
- [ ] If built: the graph bookmark's `showArrow: true` (`graph-bookmark.ts:104`) should
      probably flip to `false` in that mode, since the arrows would be meaningless
- [ ] Backlinks already provide the reverse relationships, and the LaTeX scheme already
      shows reactants — worth confirming this setting solves a real problem before
      building it
