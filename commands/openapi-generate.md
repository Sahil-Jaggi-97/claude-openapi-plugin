---
description: Scan a project (or a given path/diff) for its HTTP API surface, audit/fix it against any existing OpenAPI spec with permission, and generate a Swagger UI page mounted on the app's own port by default
---

Arguments: $ARGUMENTS

Parse `$ARGUMENTS` for a file/directory/glob scope plus optional hints:
- Output structure: default is a **multi-file spec** — a hand-editable `openapi/openapi.yaml`
  root (using `$ref`s, not a duplicate copy) plus one `openapi/paths/<tag>/<name>.yaml` per path
  template — the *only* spec artifact written to disk by default; the viewer's embedded spec is
  computed from these in memory. "single file" / "one file" / "bundle only" / "no split" → skip
  the split and write only the single merged file instead. This choice only governs what a
  *first-ever* run creates — an audit run against an existing spec keeps whatever structure
  (single-file or multi-file) that spec is already in; see the agent for how to handle an
  explicit request to convert an existing single-file spec.
- Merged bundle (opt-in, multi-file mode only): not written by default — it would duplicate the
  split source's content at the project root. "also generate a merged bundle" / "bundle for
  Postman" / "flatten it" (or an explicit output path/filename) → also write the fully-merged
  document, for tooling that doesn't resolve external `$ref`s. "yaml" in the same request → that
  bundle is `openapi.yaml` instead of `.json` (the split source files under `openapi/` are
  always `.yaml` regardless of this hint). Nothing said → defaults to `openapi.json`, only if a
  bundle was requested at all.
- "audit" / "check" / "fix" / "is this up to date" — no behavior change (the agent always
  diffs against an existing spec when one's found and asks permission before fixing anything),
  but worth recognizing as scope/intent language rather than stripping it out as noise.
- "start clean" / "regenerate from scratch" / "ignore the existing spec" → tell the agent to
  skip existing-spec detection and run as a first-ever generation.
- Title/version: an explicit API title and/or version mentioned → use them. Nothing said → let
  the agent infer a title from the project (or the existing spec's own `info` block).
- Viewer: "spec only" / "no html" / "skip the viewer" → don't generate the Swagger UI page.
  Nothing said → generate it by default (that's what makes the API browsable, per this
  plugin's purpose).
- Mounting: by default the viewer is also mounted onto the app's own port at `/api-docs`
  (see `references/mounting-docs.md`) instead of being reachable only via `file://`. An
  explicit route path in the arguments ("mount at /docs", "--route /swagger") → use it instead.
  "file only" / "no mount" / "just the file" / "standalone file" → skip mounting, report the
  `file://` path only. It's reachable in any environment the app runs, including production, by
  default — "dev only" / "gate it" / "--dev-only" → mount it behind the framework's own
  environment check instead.
- "as a table" / "tabular" / "summary table" → ask the agent to also produce the change table
  of what was added/fixed. Nothing said → don't produce one (it's opt-in).
- "my changes" / "the diff" / "this PR" → scope to the current diff (skill/agent resolves the
  actual `git diff` invocation).

Whatever remains after stripping those hints is the scope. If no scope was given at all, ask
the user what to scan (a path, a glob, a directory, "the API", or "the diff") before
proceeding — don't default to scanning the whole repo.

Invoke the `openapi-generator` subagent (Agent tool) with the resolved scope, output
path/structure, title/version, existing-spec handling, viewer preference, mounting preference,
and whether a change table was requested. Relay its findings report and fix-permission workflow to the user directly
as it runs, then its final summary (and change table, if requested) — don't re-run the
discovery, diff, or fix logic yourself in this command.
