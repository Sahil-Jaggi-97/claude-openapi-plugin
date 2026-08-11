# openapi-docs

A Claude Code plugin that scans a project's source code and discovers its HTTP API surface —
every method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`), path/query/header
parameters, request/response body shapes, **authorization requirements** (bearer/JWT, API key,
Basic, OAuth2, session/cookie), and **multipart file-upload endpoints** (single and multiple
files) — and generates an **OpenAPI 3.0 spec** plus a **self-contained, browsable Swagger UI
page**, so you (or anyone on the team) can check the API in a browser.

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
  generates the standalone viewer, and reports a summary.
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
  beats a fabricated type), and source-traceability annotations.
- **`skills/openapi-generate/assets/swagger-ui-template.html`** — the viewer template: Swagger
  UI loaded from a CDN with the generated spec embedded inline, so the output HTML opens
  directly via `file://` with no local server needed.

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
/plugin marketplace add <owner>/<repo>
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

1. Resolve scope (explicit path, a diff, or a directory) and output preferences (spec path/
   format, title/version, whether to generate the viewer).
2. Identify the stack(s) in scope from manifest files (`package.json`, `requirements.txt`,
   `go.mod`, `Gemfile`, `composer.json`, `pom.xml`, `.csproj`) or, failing that, the generic
   fallback pattern.
3. Discover every route by `Grep`-ing for that stack's patterns, then `Read`-ing each matched
   file in full — never recording a route from a grep snippet alone.
4. Classify each route's auth mechanism and file-upload shape by reading the actual
   middleware/decorator/dependency, not by name-matching alone.
5. Assemble the OpenAPI 3.0 document (grouped by router/controller, honest about fields it
   genuinely can't type, annotated with `x-source-file`/`x-source-line` for traceability) and
   write it to disk.
6. Generate the standalone Swagger UI viewer with the spec embedded inline.
7. Report a summary: stacks detected, route counts by method, auth schemes and which routes
   need them, upload endpoints, and any low-confidence/uncertain routes.

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

The generated `openapi-docs.html` is a single file — no server, no build step. Open it directly
in a browser. It loads Swagger UI's JS/CSS from a CDN (`unpkg.com/swagger-ui-dist`) but embeds
the spec itself inline, so it works via a plain `file://` URL; the only network dependency is a
one-time fetch of Swagger UI's own assets (cached by the browser afterward). The raw spec file
(`openapi.json`/`.yaml`) is also usable directly in any other OpenAPI tool (Postman, Redoc,
Stoplight, an API gateway's import, etc.).

## Demoing this plugin

See [`demo/DEMO.md`](demo/DEMO.md) for a ready-to-run demo script, and
[`demo/sample-express-app`](demo/sample-express-app) — a tiny fixture API (never installed or
run) seeded with every HTTP method, two different auth schemes, and both single- and
multi-file upload endpoints.

## License

MIT — see [LICENSE](LICENSE).
