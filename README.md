# openapi-docs

A Claude Code plugin that scans a project's source code and discovers its HTTP API surface —
every method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`), path/query/header
parameters, request/response body shapes, **authorization requirements** (bearer/JWT, API key,
Basic, OAuth2, session/cookie), and **multipart file-upload endpoints** (single and multiple
files) — and generates an **OpenAPI 3.0 spec** — by default split into one hand-editable file
per route, using `$ref`s rather than a duplicated copy, so it's easy to review and maintain and
stays the single spec artifact on disk — and a **browsable Swagger UI page**, so you (or anyone
on the team) can check the API in a browser. By
default that page is also **mounted on the app's own port** (`/api-docs`), so it works the same
way whether the app runs locally, in Docker, or behind a devcontainer's forwarded port, with no
separate server/port of its own to publish — a plain `file://` page is still produced whenever
mounting isn't possible or you opt out of it (see "Mounting on the app's own port" below).

If a spec already exists, it **audits** it instead of blindly overwriting it: it diffs what's
actually in the code against what the spec says, proposes a fix for every gap — a missing
operation, a drifted one, or one that no longer matches any route in source — and asks
permission before applying each one, one at a time. Nothing gets edited without an explicit
yes.

This is a **static source-code discovery**, not a running-server introspection tool — it reads
your code the way a person tracing the codebase would, rather than requiring you to run the
app or annotate every route by hand. It works by reasoning about routes directly against a
reference of framework patterns, not a hardcoded per-framework parser, so it isn't limited to
one language or framework — see "Stacks covered" below.

## What's in the box

- **`skills/openapi-generate`** — the skill that triggers automatically on API-documentation
  requests ("generate OpenAPI docs", "document this API", "list all the endpoints") and
  resolves what to scan plus the output spec path/format and whether to also generate the
  Swagger UI viewer.
- **`agents/openapi-generator`** — the subagent that does the actual work: discovers routes,
  classifies each one's auth mechanism and file-upload shape, assembles the OpenAPI document,
  generates and mounts the viewer, and reports a summary.
- **`commands/openapi-generate`** — `/openapi-generate <path-or-glob>` (optionally with
  format/title/viewer hints) for triggering it explicitly instead of relying on
  natural-language matching.
- **`skills/openapi-generate/references/route-patterns.md`** — the route-discovery cheat
  sheet: deep coverage of Express/Fastify/Koa/NestJS/Next.js, solid coverage of
  FastAPI/Flask/Django REST Framework, and best-effort sections for Rails, Laravel/Symfony,
  Spring, Go, and ASP.NET Core, plus a generic fallback for anything else.
- **`skills/openapi-generate/references/auth-and-security.md`** — how to tell bearer/JWT, API
  key, Basic, OAuth2, and session/cookie auth apart (by reading the actual mechanism, not by
  guessing from a middleware's name) and map each to the right OpenAPI `securityScheme`.
- **`skills/openapi-generate/references/file-uploads.md`** — how to detect multipart uploads
  per stack (multer, `formData()`, `UploadFile`, `MultipartFile`, `IFormFile`, etc.) and
  represent single vs. multiple files correctly.
- **`skills/openapi-generate/references/openapi-authoring.md`** — document-assembly
  conventions: grouping, `operationId` naming, the honest-gap principle (an empty schema
  beats a fabricated type), source-traceability annotations, and the default multi-file layout
  (one file per route, `$ref`-linked from the root — no separate merged bundle unless asked for).
- **`skills/openapi-generate/references/diffing-and-fixes.md`** — how to locate an existing
  spec (single-file or multi-file), classify findings (Missing/Broken/Stale) against freshly
  discovered routes, shape each fix (stale routes default to `deprecated: true`, never silent
  deletion), apply it as a precisely-anchored edit to the right file that leaves everything
  else untouched, and build the optional change table.
- **`skills/openapi-generate/references/mounting-docs.md`** — how to mount the generated viewer
  onto the app's own port at a route path (default `/api-docs`): dropping it into an existing
  root-mounted static-assets folder when one exists (no permission needed), or proposing a
  minimal, permission-gated route addition per framework when it doesn't.
- **`skills/openapi-generate/assets/swagger-ui-template.html`** — the viewer template: Swagger
  UI loaded from a CDN with the generated spec embedded inline, so the output HTML is
  self-contained whether it ends up mounted on the app's port or opened standalone via
  `file://`.

## Install

**Quick, session-only test** — no marketplace, no persistent install:

```
claude --plugin-dir /path/to/claude-openapi-plugin
```

**Persistent, fully local** — from within Claude Code, in any project:

```
/plugin marketplace add /path/to/claude-openapi-plugin
/plugin install openapi-docs@openapi-docs-marketplace
```

**Persistent, shared with a team** — once this repo is pushed somewhere Claude Code can reach
it (e.g. GitHub):

```
/plugin marketplace add Sahil-Jaggi-97/claude-openapi-plugin
/plugin install openapi-docs@openapi-docs-marketplace
```

`openapi-docs-marketplace` is this repo's marketplace name (see
`.claude-plugin/marketplace.json`) — `/plugin install` needs `plugin-name@marketplace-name`,
not just the plugin name, whenever the plugin comes from a marketplace you added yourself
rather than the official/community ones.

## Ways to trigger it

1. **Natural language (skill auto-trigger)** — "generate OpenAPI docs for this project,"
   "document this API," "list all the endpoints and how they're secured." The skill's
   description matches these phrasings and routes to the agent automatically.
2. **Explicit slash command** — `/openapi-generate src/api` when you want to trigger it
   deliberately. Add hints inline: `/openapi-generate src/api --format yaml`, or "spec only,
   no viewer."
3. **Direct agent mention** — invoke `openapi-generator` by name to hand it a scope directly.

## Ways to scope it

- **A single directory**: `/openapi-generate src/routes` — the common case.
- **A whole project**: `/openapi-generate .` for a first-time pass over an existing codebase.
- **A diff/PR**: "document my changes" or "document the API surface in this PR" — scopes to
  `git diff --name-only`.
- **A monorepo subtree**: point it at one package/service at a time if the repo has more than
  one backend — the agent notes every stack it finds and scans each independently.

## What happens once it runs

1. Resolve scope (explicit path, a diff, or a directory) and output preferences (spec
   structure — multi-file by default, or single file if you ask for that — path/format,
   title/version, whether to generate the viewer, whether an existing spec should be audited
   or ignored).
2. Identify the stack(s) in scope from manifest files (`package.json`, `requirements.txt`,
   `go.mod`, `Gemfile`, `composer.json`, `pom.xml`, `.csproj`) or, failing that, the generic
   fallback pattern.
3. Look for an existing spec: the multi-file root (`openapi/openapi.yaml`) first, then a
   conventional single-file name (`openapi.json`, `openapi.yaml`, `swagger.json`, etc.). Found
   → audit run, in whichever structure it's already in. Not found → first-ever run.
4. Discover every route by `Grep`-ing for that stack's patterns, then `Read`-ing each matched
   file in full — never recording a route from a grep snippet alone.
5. Classify each route's auth mechanism and file-upload shape by reading the actual
   middleware/decorator/dependency, not by name-matching alone.
6. Diff the discovered routes against the existing spec (skipped on a first-ever run — every
   route is simply new): **Missing** (in source, not in spec), **Broken** (in both, but
   parameters/body/auth/responses have drifted), or **Stale** (in spec, no longer found in
   source).
7. Report every finding, then walk them one at a time asking permission — "Add this
   operation?" / "Update this field?" / "Mark this deprecated?" — before making narrowly-scoped
   edit(s) per approved finding: one file in single-file mode, or the specific per-route file
   in multi-file mode (plus the root's `$ref` list, only when a route is being added or removed
   entirely). Decline any of them and nothing changes; say "apply all" to stop being asked
   individually for the rest of the run.
8. Regenerate the Swagger UI viewer (in multi-file mode, by re-reading the current per-route
   files and merging them in memory — no separate bundle file is written unless you asked for
   one) with the now-current spec embedded inline, then mount it on the app's own port at
   `/api-docs` by default — dropping it into an existing root-mounted static folder when one
   exists (no permission needed), or proposing a small, permission-gated route addition to the
   app's bootstrap file otherwise (declining keeps the plain `file://` page as the only output).
9. Report a summary: stacks detected, finding/outcome counts, auth schemes and which routes
   need them, upload endpoints, any low-confidence/uncertain routes, and how/where the docs
   viewer ended up reachable — plus a markdown change table (`Path | Method | Status | Notes`)
   if you asked for one.

## Multi-file output

By default, the spec is split into one file per route so it's easy to find, review in a diff,
and hand-edit without touching unrelated endpoints:

```
openapi/
  openapi.yaml              # info, servers, tags, components, and paths as $refs
  paths/
    users/
      index.yaml             # GET/POST /api/users
      item.yaml               # GET/PUT/PATCH/DELETE /api/users/{id}
    products/
      index.yaml
      item.yaml
```

These split files are the source of truth — edit them by hand, review them in PRs — and the
*only* spec artifact written to disk by default; no separate merged `openapi.json`/`.yaml` copy
is written alongside them, since that would just duplicate their content at the project root.
The Swagger UI viewer still needs a fully-resolved spec, but that's computed from the split
files in memory and embedded directly into the viewer, not persisted as its own file.

If you actually need one complete file — for tooling that doesn't resolve external `$ref`s
(codegen, some CI linters, Postman/Redoc/Stoplight import) — say "also generate a merged
bundle" / "bundle for Postman" / "flatten it" and it's written alongside the split source (it
carries an `x-generated-from` marker pointing back at `openapi/openapi.yaml` so it's clearly
generated output, not something to hand-edit). Say "single file" / "one file" / "bundle only" /
"no split" if you'd rather skip the split entirely and get just the one merged file, as this
plugin worked before.

If you ran this plugin before bundling became opt-in, a stray `openapi.json`/`.yaml` may still
be sitting at your project root alongside `openapi/` — it's no longer auto-regenerated, so a
future audit run flags it explicitly as a stale legacy bundle rather than silently leaving it to
drift out of sync. Delete it, or ask for a bundle to be generated again if you still want one.

## Auditing and fixing an existing spec

Run it again against a project that already has a spec and it switches from "generate" to
"audit" automatically — no flag needed, just ask it to check, audit, or fix the docs (or simply
re-run it; existing-spec detection is automatic, and works the same whether the spec is
single-file or the default multi-file layout). It never overwrites anything wholesale, and it
never changes an existing spec's structure on its own — a single-file spec you already have
stays single-file until you explicitly ask to convert it. Every change is a targeted edit to
just the operation(s) that actually need it, leaving hand-written descriptions, examples, and
any other manual enrichment untouched.

- **Missing coverage** (a route in code with no spec entry) → proposes adding the full
  operation.
- **Broken coverage** (a spec entry whose parameters/body/auth/responses no longer match the
  code) → proposes updating only the drifted fields, nothing else in that operation.
- **Stale coverage** (a spec entry whose route can no longer be found in source) → proposes
  marking it `deprecated: true`, not deleting it — route discovery can miss things, so removal
  is only applied if you ask for it explicitly for that finding.

Every fix is proposed and applied one at a time, with an "apply all" shortcut once you trust
the run. Ask for "a table" or "a summary table" afterward (or in the same request) for a
markdown breakdown of exactly what was added vs. fixed vs. deprecated.

## Mounting on the app's own port

By default the viewer isn't just written as a standalone file — it's also mounted onto the
app's own port at `/api-docs`, so it works the same way whether the app is running locally, in
Docker, or behind a devcontainer's forwarded port, with no extra port to publish. Two ways it
does that, tried in order:

1. **Drop into an existing static-assets folder** (no permission needed) — if the framework
   already serves a folder at the URL root (Next.js's `public/`, Rails/Laravel/Symfony's
   `public/`, Spring Boot's `src/main/resources/static/`, ASP.NET's default `wwwroot/`, or an
   Express/Fastify/Koa static mount with no path prefix), the viewer is written straight into
   it. The reachable URL is `/api-docs.html` (a flat file, since not every static server
   resolves a bare directory path to an index file).
2. **Add an explicit route** (needs your explicit yes) — if there's no such folder, a small,
   framework-appropriate route registration (e.g. `app.get('/api-docs', ...)` in Express,
   `@app.get("/api-docs")` in FastAPI/Flask) is proposed for the app's bootstrap file, with the
   exact snippet and insertion point shown before anything is edited. Decline it and you keep
   the standalone `file://` page instead — nothing about the app's source changes.

Say "mount at /docs" (or any other path) to use a different route than the default `/api-docs`.
Say "file only" / "no mount" / "just the file" / "standalone file" to skip mounting entirely and
get only the plain `file://` page, the way this plugin worked before mounting became the
default. Note that the generated `openapi-docs.html` (and, for Strategy 2, the edited bootstrap
file) need to actually be present inside a Docker image to be reachable there — a rebuild or
bind-mount may be needed if the file was generated after the image was last built.

**Security note**: mounting isn't gated by environment by default — the route/file is reachable
wherever the app runs, including production, since gating it unconditionally would break the
Docker/deployed use case this exists for. The page discloses your full discovered API surface
(every path, and each route's auth *mechanism* — never actual secrets/credentials) to anyone who
can reach it. The run's summary always states this plainly. Say "dev only" / "gate it" / "not in
production" to have it mounted behind the framework's own environment check
(`NODE_ENV !== 'production'`, `app.Environment.IsDevelopment()`, `settings.DEBUG`, etc.) instead
of unconditionally.

Two more safety details: Strategy 1 never silently overwrites a file that isn't its own prior
output (every viewer it writes carries a `generated-by: openapi-docs-plugin` marker; a same-named
file without that marker is treated as a real collision and flagged instead of clobbered), and
Strategy 2 checks the resolved route path against your app's own discovered routes first, so it
won't propose registering a duplicate/conflicting handler on top of a route you already have.

See `skills/openapi-generate/references/mounting-docs.md` for the full per-stack detection
rules and route snippets.

## Stacks covered

Deep: Express, Fastify, Koa, NestJS, Next.js (Pages Router + App Router).
Solid: FastAPI, Flask, Django REST Framework.
Best-effort: Ruby on Rails, PHP Laravel/Symfony, Java/Kotlin Spring, Go
(net/http/gin/echo/chi), C# ASP.NET Core.
Anything else: a generic fallback (HTTP-method keyword next to a path-like string, or a
routing decorator/annotation) — it says explicitly when a route's method or shape couldn't be
confidently determined rather than guessing silently.

See `skills/openapi-generate/references/route-patterns.md` for the full per-stack pattern
list.

## Viewing the output

`openapi-docs.html` is a single self-contained file either way — no build step. It loads Swagger
UI's JS/CSS from a CDN (`unpkg.com/swagger-ui-dist`) but embeds the spec itself inline (always a
fully-resolved copy computed in memory from the split source, never a separate file on disk,
since an inline JS object has no base URL to resolve relative `$ref`s against), so the only
network dependency is a one-time fetch of Swagger UI's own assets (cached by the browser
afterward).

- **Mounted (default)**: open `http://<app-host>:<app-port>/api-docs` (or `/api-docs.html` if
  it was placed in a static folder — see "Mounting on the app's own port" above) once the app
  itself is running.
- **Standalone**: if mounting was skipped or declined, open the file directly via a plain
  `file://` URL — no server needed at all.

**"Try it out"**: the spec's `servers:` entry defaults to `/` when mounting succeeds — a
relative URL that resolves against the app's own origin, so Swagger UI's "Try it out" panel can
send real requests with no extra configuration. When the outcome ends up standalone instead
(mounting skipped, declined, or not applicable), `servers:` is omitted rather than guessing a
fabricated host/port, and "Try it out" won't be able to send requests from that page — the run's
summary always says which case applies.

If you also need one complete file for another OpenAPI tool (Postman, Redoc, Stoplight, an API
gateway's import, etc.) that may not resolve external `$ref`s, ask for a merged bundle (see
"Multi-file output" above) — it isn't written by default.

## License

MIT — see [LICENSE](LICENSE).
