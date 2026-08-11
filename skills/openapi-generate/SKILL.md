---
name: openapi-generate
description: Scans a project's source code (any backend stack — Express, Fastify, Koa, NestJS, Next.js, FastAPI, Flask, Django REST Framework, Rails, Laravel, Symfony, Spring, Go, ASP.NET Core, or a generic fallback) to discover its HTTP API surface, diffs it against any existing OpenAPI spec, and proposes fixes for missing or broken coverage — asking permission before applying each one — then generates a browsable Swagger UI page and mounts it on the app's own port (e.g. `/api-docs`) by default. Covers every HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS), path/query/header parameters, request/response body shapes, authorization requirements (bearer/JWT, API key, Basic, OAuth2, session/cookie), and multipart file-upload endpoints (single and multiple files). Use when asked to document an API, generate OpenAPI/Swagger docs, audit or fix an existing OpenAPI/Swagger spec, check whether API docs are up to date, find missing/broken endpoints in a spec, produce API reference documentation, or find/list all the endpoints in a project. Can also produce a markdown table summarizing what was added/fixed, on request.
---

# OpenAPI generation

This skill resolves what to scan, where the spec lives (new or existing), and what to write,
then hands the real work off to the **`openapi-generator`** subagent, which reads the source
directly (no bundled scanner tool — it reasons about routes the same way a person tracing the
codebase would), diffs what it finds against any existing spec, proposes a fix for every gap
and asks permission before applying it, then generates a standalone Swagger UI viewer.

## 1. Resolve scope

- Explicit path(s)/glob in the request → use them.
- "document my changes / the diff / this PR" → `git diff --name-only` (against the stated base
  branch, or the default branch if unstated), then pass the affected directories/files as
  scope — note to the agent that other, unchanged routes in the same files should still be
  captured for context (a diff scope narrows *what's new*, not what's worth reading).
- A directory, "the API", "the backend", or the whole project mentioned by name → discover
  under it.
- Nothing specified at all → ask which directory or project to scan. Don't default to scanning
  the whole repo silently — a monorepo with an unrelated frontend-only package would produce a
  misleading "no routes found" or a spec mixing unrelated services.

## 2. Resolve output preferences

- Spec output: default is a **multi-file spec** under `openapi/` — a root `openapi/openapi.yaml`
  (using `$ref`s, not a duplicate copy) plus one `openapi/paths/<tag>/<name>.yaml` per path
  template — which are the files developers hand-edit and review in diffs, and the *only* spec
  artifact written to disk by default; the HTML viewer's embedded spec is computed from these in
  memory, not from a separate written file. If the request says "single file" / "one file" /
  "bundle only" / "no split", skip the multi-file structure and write only the single merged
  file instead. This preference only governs what a first-ever run creates; see the next bullet
  for runs against an existing spec.
- Merged bundle (opt-in, multi-file mode only): don't write one by default — it would duplicate
  the split source's content at the project root. Only write it if the request explicitly asks
  ("also generate a merged bundle" / "bundle for Postman" / "flatten it", or an explicit output
  path for one), since some external tooling (codegen, CI linters, Postman/Redoc/Stoplight
  import) needs one complete file rather than the split source. When requested: explicit path in
  the request → use it; otherwise default to `openapi.json` at the root of the scanned project
  (or `openapi.yaml` if the request mentions "yaml").
- Existing spec: by default, let the agent auto-detect one — either the multi-file root
  (`openapi/openapi.yaml`) or one of the conventional single-file names — at the resolved path,
  per `references/diffing-and-fixes.md`, and run in audit mode against it. **The agent keeps
  whatever structure the existing spec is already in** (single-file stays single-file,
  multi-file stays multi-file) — an audit run never silently restructures existing files. If
  the user explicitly asks to convert an existing single-file spec to the multi-file layout (or
  vice versa), pass that along as an explicit one-time request rather than something the agent
  infers on its own. If the user explicitly wants to start clean instead (e.g. "regenerate from
  scratch", "ignore the existing spec"), tell the agent to skip detection and treat the run as
  first-ever.
- Title/version: use if given in the request; otherwise let the agent infer a sensible title
  from the project (e.g. `package.json`'s `name`) and default the version to `0.1.0` (existing
  spec's own `info` block wins if one is found, unless the user gives an explicit override).
- HTML viewer: generate `openapi-docs.html` next to the spec by default (this is what makes
  the API "checkable in browser," per the plugin's purpose) — skip it only if the request
  explicitly asks for the spec file alone with no viewer.
- Mounting: by default, also mount the viewer onto the app's own port at `/api-docs` (per
  `references/mounting-docs.md`) rather than leaving it reachable only via `file://` — this is
  what makes it work the same way whether the app runs locally, in Docker, or behind a
  devcontainer's forwarded port. An explicit route path in the request → use it instead of
  `/api-docs`. "file only" / "no mount" / "just the file" / "standalone file" → skip mounting
  and report the plain `file://` path only, same as this plugin's behavior before mounting
  became the default. This is reachable in whatever environment the app runs, including
  production — always say so in the report. "dev only" / "gate it" / "not in production" → mount
  it behind the framework's own environment check instead of unconditionally.
- Change table: only pass this through if the user actually asked for "a table" / "tabular" /
  "summary table" of what changed — it's opt-in, not part of the default report.

## 3. Delegate

Invoke the `openapi-generator` agent (Agent tool, matching subagent by name) with the resolved
scope, output path(s), title/version, existing-spec handling, whether to generate the HTML
viewer, mounting preference (route path, or opted out), and whether a change table was
requested. Relay its findings report and fix-permission
workflow — Missing/Broken/Stale findings, one at a time, "apply this fix?" before it edits
anything — to the user directly, then relay its final summary (and change table, if requested)
the same way; don't re-run the discovery, diff, or checklist yourself in this skill.

## 4. Fallback if the agent isn't available

If the `openapi-generator` agent isn't available in the current environment (e.g. the plugin's
agent isn't registered), fall back to doing a **read-only** pass yourself:
1. `Read` `references/route-patterns.md`, `references/auth-and-security.md`,
   `references/file-uploads.md`, and `references/diffing-and-fixes.md` in full.
2. Identify the stack(s) and discover routes per those references, same discipline (`Grep` to
   find candidates, `Read` each matched file in full before recording anything).
3. If an existing spec is found, diff against it per `references/diffing-and-fixes.md` and
   report the findings (Missing/Broken/Stale) as a plain summary — a markdown table is fine if
   asked for. **Never apply a fix in the fallback path** — no `Edit`, no `Write`, regardless of
   what the user says yes to. Only the dedicated agent is authorized to propose-and-apply
   fixes; half-emitting a spec file without the full authoring/diffing conventions would
   produce a worse artifact than a report-only pass.
