# Diffing an existing spec and proposing fixes

This is the source of truth for audit mode: comparing what's actually in the code (the
"proposed" state, discovered per `route-patterns.md`/`auth-and-security.md`/
`file-uploads.md`) against what an existing OpenAPI spec says, turning the differences into
findings, and applying approved fixes precisely without disturbing anything else in the file.

## 1. Locating an existing spec

Check, in order:
1. The output path the caller/skill resolved (explicit request, or a path already in use from
   a prior run).
2. The multi-file root `openapi/openapi.yaml` at the scanned root — this is a **multi-file
   existing spec**.
3. Conventional single-file names at the scanned root: `openapi.json`, `openapi.yaml`,
   `openapi.yml`, `swagger.json`, `swagger.yaml`, `docs/openapi.json`, `docs/openapi.yaml` —
   this is a **single-file existing spec**.

**Legacy bundle check**: if Step 2 found a multi-file root *and* one of Step 3's conventional
single-file names also exists at the scanned root, that second file isn't the existing spec (the
multi-file root always wins) — it's almost certainly a merged bundle left over from before
bundle-writing became opt-in (`openapi-authoring.md`'s "merged view" section), or from an
earlier explicit "also generate a bundle" request. Since bundle-writing is opt-in now, this file
is no longer being regenerated and can silently drift out of sync with the real spec. Say so
plainly in the report ("found a legacy `<path>` bundle alongside the multi-file spec — it's no
longer auto-updated; delete it, or say 'also generate a merged bundle' to keep it current") — 
don't touch or delete it without being asked, just flag it.

If none of these exist, this is a **first-ever run**: there is no existing content to protect,
so every discovered route becomes a **Missing** finding (see Step 3) and the permission loop in
`agents/openapi-generator.md` Step 7 builds the spec up one approved operation at a time, in
whichever structure (multi-file by default, or single-file if the caller opted out) was
resolved for this run.

If a file is found but fails to parse as valid JSON/YAML, or its top-level shape isn't a
recognizable OpenAPI document (no `paths` key), say so plainly in the report as its own
finding ("existing spec at `<path>` could not be read: `<reason>` — treating this as a
first-ever run" or, if the user would rather fix the file by hand first, ask before proceeding)
rather than silently overwriting or silently ignoring it. The same applies if the multi-file
root parses fine but a `$ref`'d path file is missing or unparseable — name the specific broken
file rather than failing the whole run silently.

**The structure of whichever existing spec is found governs the rest of this run** — a
single-file spec stays single-file, a multi-file spec stays multi-file. Never restructure an
existing spec from one to the other as a side effect of an audit run; that's a big, visible
change a developer should ask for explicitly (see "Converting an existing spec" at the end of
this file), not something that happens because today's default changed.

## 1b. Reading a multi-file spec into a merged view

When Step 1 finds `openapi/openapi.yaml`, build the same in-memory merged document Steps 2-4
expect from a single file, before doing anything else:
1. `Read` `openapi/openapi.yaml` for `info`/`servers`/`tags`/`components` and its `paths:` map.
2. For every entry in `paths:`, it's a whole-document external reference (per
   `openapi-authoring.md`'s Multi-file output section — no JSON-pointer fragment to resolve).
   `Read` the referenced file; its top-level content **is** that path's Path Item Object.
   Assign it to that path key in the merged view.
3. Proceed with Steps 2-4 below exactly as if this merged view were the single document Read
   from disk — the diff logic doesn't know or care which structure produced it.

Keep a record of which source file backs each path template (the root's `$ref` target) — Step 5
needs it to know which file to `Edit` for each finding.

## 2. The diff key

`(method, path)` identifies one operation — exact string match on the path template (e.g.
`/users/{id}`, not `/users/:id` — normalize source path syntax the same way
`route-patterns.md`'s per-stack sections already do before comparing).

For every discovered route:
- Not present in the existing spec at all → **Missing**.
- Present in the spec, and also found in source → compare substantively (Step 3) → **Broken**
  (drifted) or no finding at all (matches).

For every operation present in the existing spec:
- Its `(method, path)` was **not** produced by this run's source discovery → **Stale**. Before
  concluding this, double check it's not just a scope-boundary artifact (the operation belongs
  to a part of the project outside the resolved scope for this run) — if the scope was
  narrower than the whole project, note that explicitly rather than flagging every
  out-of-scope operation as stale.

## 3. What counts as substantive drift (→ Broken)

Compare only these fields between the existing operation and the freshly discovered one:
- **Parameters** — path/query/header parameter names and their `required` value. A parameter
  present in source but missing from the spec (or vice versa) is drift.
- **Request body** — presence/absence, `content` type (`application/json` vs
  `multipart/form-data`), and whether top-level properties source shows are missing from the
  spec's schema (or the spec claims a property source has no evidence of).
- **`security`** — whether an auth requirement exists at all, and if so, which scheme. A route
  now behind `jwtAuth` that the spec shows as unauthenticated (or the reverse) is drift.
- **Response status codes present** — a status code source clearly produces
  (`res.status(409)...`, an explicit raised exception mapped to a code, etc.) that's absent
  from the spec, or vice versa.

**Never** flag as drift, even if they differ: `summary`/`description` wording, `operationId`
formatting, `x-*` annotations, schema property ordering, or any schema detail beyond what's
listed above (e.g. a manually-added `example`, a tightened `enum`, extra documented response
headers). These are either cosmetic or likely intentional manual enrichment — this workflow
must never propose "fixing" them away. When genuinely unsure whether something is drift or
enrichment, don't flag it; a missed finding is recoverable on a future run, an unwanted
overwrite of hand-written content is not.

## 4. Fix shape per finding type

**Missing** — propose adding the complete operation object, built exactly as
`openapi-authoring.md` describes (grouping/tags, `operationId`, honest-gap schemas,
`x-source-file`/`x-source-line`).

**Broken** — propose updating *only* the drifted field(s) identified in Step 3, leaving every
other part of the existing operation object (description, examples, unrelated responses,
`x-*` annotations) exactly as it is. Show the finding as a minimal current → proposed diff of
just those fields, not a full operation replacement.

**Stale** — default proposal is adding `deprecated: true` to the existing operation, nothing
else removed or changed. Note in the finding that outright deletion is available this run if
the user asks for it explicitly instead of accepting the default — don't offer deletion as the
primary option, and don't apply it without the user naming that choice specifically (a plain
"yes"/"apply this fix" to a Stale finding means the deprecate default, not deletion).

## 5. Applying a fix precisely (`Edit` anchoring)

There's no bundled formatter or AST tool for the spec file itself (consistent with this
plugin's no-bundled-tool design) — fixes are applied as direct, narrowly-scoped `Edit` calls.
Which file(s) a given finding touches depends on whether this run's existing spec is
single-file or multi-file (Step 1).

### Single-file spec

Anchor `old_string` so the match is unique and minimal:

- **Updating or deprecating an existing operation**: anchor on that operation's own
  `"<path>": { ... "<method>": { ... } }` block — scope the edit as tightly as possible around
  just the changed field(s) (e.g. just the `security` array, or just the `deprecated` key
  insertion point), not the whole operation object, so unrelated manually-written content
  can't be accidentally touched.
- **Adding a brand-new path**: anchor on the immediately preceding sibling path's closing
  `},` (or on `"paths": {` if it's the very first path in the document) so the new entry lands
  in a stable, unique location.
- **`.yaml`/`.yml` documents**: same anchoring idea, using the `  /path:` line and the
  consistent 2-space indentation `openapi-authoring.md` already specifies for emission — never
  mix tabs/spaces or change existing indentation while editing around it.

If an anchor can't be made unique from local context alone (e.g. two structurally identical
blocks), read more surrounding lines until a unique anchor is found rather than guessing at
which occurrence `Edit` will hit.

### Multi-file spec

Each path template already lives in its own small file (`openapi/paths/<tag>/<name>.yaml`),
per Step 1b's record of which file backs which path — so most fixes anchor inside that one
file, which is inherently easier to keep unique than a monolithic document. A finding needs
more than one call only when it touches the root's `paths:` map (registering or removing a
`$ref`), never more than that:

| Situation | Call(s) |
|---|---|
| First-ever run, first approved finding overall (root `openapi/openapi.yaml` doesn't exist yet) | `Write` the root with `info`/`servers`/`tags`/`components` plus this one path's `$ref` entry, **and** `Write` the target `openapi/paths/<tag>/<name>.yaml` with just this operation |
| Root exists; target path template has no file yet (brand-new path) | `Edit` the root's `paths:` map to add the new `$ref` entry, **and** `Write` the new `openapi/paths/<tag>/<name>.yaml` with just this operation |
| Root exists; target path template already has a file, adding a new method to it (Missing) | `Edit` that file to add the new method key |
| Broken | `Edit` just the drifted field(s) inside that path template's own file — the file already scopes to one path, so anchor on the method key, not the whole file |
| Stale, deprecate (default) | `Edit` that path template's file to add `deprecated: true` under the affected method |
| Stale, outright removal, other methods remain in the file | `Edit` the file to remove just that method key |
| Stale, outright removal, it was the only method in the file | `Edit`/remove the operation from the file, **and** `Edit` the root's `paths:` map to remove its `$ref` entry, **and** delete the now-empty leaf file (`Bash rm`) |

Determine `<tag>` and `<name>` for a brand-new path exactly as `openapi-authoring.md`'s
Multi-file output section describes (tag from the route's natural grouping; `index.yaml` for
the bare resource path, `item.yaml` for its `{param}` sub-path, a descriptive kebab-case name
otherwise). Within whichever file a fix targets, anchor `old_string` the same way as the
single-file case above (the method key, the field being changed) — the difference is only
*which* file, not how precisely to anchor within it.

The root `openapi/openapi.yaml` itself is never touched for a Broken or a deprecate-only Stale
fix — only for adding or removing a `$ref` entry, which happens exactly in the two rows above
that mention it.

### Verifying the write

There's no bundled YAML/JSON validator in this plugin, so after every `Edit`/`Write` to a spec
file, actually confirm it still parses — don't rely on having eyeballed the edit correctly,
since a single wrong indent or an unescaped colon in a string breaks every operation the file
covers, not just the one just touched:

1. Prefer running a real parser via `Bash` if an interpreter is available in the project's
   environment: e.g. `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" <file>`
   for a `.yaml`/`.yml` file, or `python3 -m json.tool <file> >/dev/null` /
   `node -e "JSON.parse(require('fs').readFileSync(process.argv[1]))" <file>` for a written
   JSON bundle. A non-zero exit or a printed traceback means the write broke the file — fix it
   immediately (re-`Read` the file, correct the anchor/content, re-verify) before moving to the
   next finding.
2. If no such interpreter is reachable in the environment (rare, but don't fail the whole run
   over it), fall back to `Read`-ing the written region back and manually re-checking
   indentation consistency, quoting, and bracket/colon balance against
   `openapi-authoring.md`'s emission conventions — slower and less reliable than an actual
   parse, so only a fallback, not the default.
3. This check is per-file, not per-finding — if two findings in the same run land in the same
   file, verifying after the second write covers both; don't skip verification on a file just
   because an earlier finding already touched it once successfully.

## 6. The change table (opt-in)

Only produce this when the user's request (this run or a follow-up in the same conversation)
asks for "a table," "tabular," or a "summary table" of the results. Build it from the
Added/Fixed/Deprecated bookkeeping already kept while walking the permission loop — don't
re-diff to build it.

```markdown
| Path | Method | Status | Notes |
|---|---|---|---|
| /api/documents/upload | POST | Added | multipart upload, apiKey auth |
| /api/users/{id} | PATCH | Fixed | added missing bearer auth requirement |
| /api/legacy/ping | GET | Deprecated | route not found in source this run |
```

Only include rows for operations actually changed this run (`Added`/`Fixed`/`Deprecated`, and
`Removed` only if outright deletion was applied) — omit `Unchanged` operations entirely to keep
the table focused on what happened, not a full spec listing.

## Converting an existing spec

If the user explicitly asks to convert an existing spec from single-file to multi-file (or the
reverse) — not something to infer on your own from the default changing — treat it as one
reviewable, permission-gated action before the normal audit flow: read the existing spec in
full, then either split it (write the root plus one file per path template, per
`openapi-authoring.md`'s Multi-file output section, sourced from the existing spec's own
content rather than fresh discovery) or merge it (dereference every split file into one
document). Confirm the plan (old structure → new structure, file count) before writing
anything, since this touches every path in the spec at once rather than one finding at a time.
Once converted, continue the run as a normal audit against the newly-written structure.
