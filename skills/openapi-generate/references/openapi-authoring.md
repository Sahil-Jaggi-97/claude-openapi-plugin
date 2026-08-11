# OpenAPI document authoring conventions

Applies once route discovery (`route-patterns.md`), auth classification
(`auth-and-security.md`), and upload classification (`file-uploads.md`) are done, when
assembling the final document.

## Document shape

Target **OpenAPI 3.0.3**. Top-level structure:

```yaml
openapi: 3.0.3
info:
  title: <resolved title — from the skill/command argument, else the package/project name, else "Discovered API">
  version: <resolved version — from argument, else "0.1.0">
  description: <one or two sentences: stack(s) detected, generation is static-analysis-based>
servers:
  - url: <"/" when the caller's mounting preference resolved to "mount on the app's own port"
      (the default — see mounting-docs.md), since the viewer will be served from that same
      origin, making a relative "/" both true and non-fabricated. Otherwise (caller explicitly
      opted out of mounting, "file only" style) omit servers entirely rather than guessing
      localhost with a fabricated port — a bare file:// viewer has no real origin to point at,
      and "Try it out" won't work there regardless; say so in the final report rather than
      papering over it with a fake URL. A confidently-inferable real base URL (an explicit one
      in the request, or a documented one) always wins over both of these defaults.>
tags:
  - name: <group name>
paths: { ... }
components:
  securitySchemes: { ... }   # only if at least one route uses auth — see auth-and-security.md
  schemas: { ... }           # optional: promote a request/response shape here and $ref it if
                              # the same shape repeats across 3+ operations; don't do this for
                              # one-off shapes, inline is clearer
```

## Multi-file output (default)

Unless the caller asked for a single file, split path definitions across files so a developer
can find, review, and diff one resource's routes without touching an unrelated one. Layout:

```
openapi/
  openapi.yaml               # info, servers, tags, components, and paths as whole-document $refs
  paths/
    <tag>/
      index.yaml              # the bare resource path, e.g. GET/POST /api/users
      item.yaml                # that same resource's /{id} (or other single-param) sub-path
      <other-name>.yaml        # any other path template under this tag (an upload route, a
                                # nested action, a second resource sharing the tag)
```

### Root file's `paths:` entries

Each entry is a **whole-document** external reference — never a JSON-pointer fragment
(`#/...`), never an escaped `/` (`~1`). The target file's top level *is* the Path Item Object:

```yaml
# openapi/openapi.yaml
paths:
  /api/users:
    $ref: './paths/users/index.yaml'
  /api/users/{id}:
    $ref: './paths/users/item.yaml'
```

```yaml
# openapi/paths/users/item.yaml
get:
  operationId: get_users__id_
  ...
put:
  operationId: put_users__id_
  ...
```

A Path Item Object bundles one URL template's full set of methods — this is why the split is
per-path-template, not per-operation: `GET/PUT/PATCH/DELETE /api/users/{id}` stay together in
one file even though they're distinct operations, because that's how a developer actually reads
and edits a route. It's also why an audit-mode fix (`diffing-and-fixes.md` Step 5) usually
touches only one small file instead of navigating a monolithic document.

### File naming within a tag's directory

- The bare tag path (no path params) → `index.yaml`.
- That same resource's single `{param}` sub-path → `item.yaml`.
- Anything else under the tag → a short kebab-case name describing the path's purpose (e.g.
  `avatar.yaml`, `product-image.yaml`), not a mechanical transliteration of the path segments —
  never put literal `{`/`}` characters in a filename.
- A tag with only one path template total still gets `index.yaml` — don't special-case away
  the subdirectory just because there's nothing to disambiguate yet.

### Components stay centralized

`components.securitySchemes` and any promoted `components.schemas` live only in the root
`openapi/openapi.yaml` — they're cross-cutting and referenced from multiple tags, so splitting
them per-tag would mean either duplication or cross-file `$ref`s reaching into other tags'
directories, which defeats the point of the split.

### The merged view — computed, not written, by default

The split source is still the only spec artifact on disk by default — don't also write a
fully-merged, `$ref`-free copy to a single-file path (e.g. `openapi.json`) at the project root
just because one might be useful; a second complete copy of the same content sitting next to
the split source it was derived from is exactly the duplication the split exists to avoid.

The HTML viewer still needs a fully-resolved document (it embeds the spec as a plain JS object
with no base URL to resolve relative `$ref`s against), so the merge itself still happens — build
it in memory by reading the root `openapi/openapi.yaml` plus every file it `$ref`s (same
procedure as `diffing-and-fixes.md` Step 1b), and use that in-memory result directly as the
viewer's embedded spec. Nothing about that computation is written back to disk as a separate
file; the split files remain the only persisted spec source, and the viewer is the only place
the fully-resolved copy lives. On an audit run that applies fixes to split files, recompute this
in-memory merge fresh from the current split files before regenerating the viewer — never carry
forward a stale merge from earlier in the run.

### Opting in to a written bundle

Some external tooling (codegen, a CI linter, Postman/Redoc/Stoplight import) doesn't resolve
external `$ref`s and needs one complete file instead of the split source. Only write one when
the caller's request actually asks for it ("also generate a merged bundle", "bundle for
Postman", "flatten it") — write the same in-memory merged document described above to the
single-file output path (default `openapi.json`), marked with
`x-generated-from: "openapi/openapi.yaml"` at the document's top level so a reader who opens it
directly knows where the real source lives. Treat it the same as the viewer for freshness: an
audit run that writes one regenerates it from the current split files, never patching the old
copy incrementally.

### Opting out of the split entirely

If the caller's request said "single file" / "one file" / "bundle only" / "no split", skip the
`openapi/` split entirely and write only the single merged document — the pre-multi-file
behavior, still fully supported. An audit run against an existing single-file spec also stays
single-file by default; see `diffing-and-fixes.md`'s "Converting an existing spec" for how to
handle an explicit request to change an existing spec's structure.

## Grouping (`tags`)

Group operations by their natural unit in the source: an Express/Koa/Fastify router file, a
NestJS/Spring/ASP.NET controller class, a Rails/Laravel resource, a Next.js top-level API
segment (`/api/users/**` → tag `users`). Every operation gets exactly one tag reflecting this
grouping — it's what makes the generated Swagger UI navigable instead of one flat list.

## `operationId`

`<method>_<path-with-slashes-and-braces-replaced-by-underscores>`, lowercase, e.g.
`get_users__id_` for `GET /users/{id}`. Must be unique across the document — if a collision
would occur (rare, e.g. two frameworks producing the same path+method), disambiguate with the
source stack name.

## Parameters

- Path params: `required: true` always (a path segment can't be optional).
- Query params: `required: false` unless source clearly shows a check that rejects the request
  when absent (e.g. an explicit "missing required param" 400 branch) — then `true`.
- Header params (custom, non-auth headers read via `req.headers[...]`/`@RequestHeader`/etc.):
  same required-ness rule as query params.
- `schema.type` comes from actual usage (parsed with `Number(...)`/`parseInt` → `integer`, used
  in a boolean check only → leave as `string` unless explicitly parsed, since HTTP query/path/
  header values are always strings on the wire — only mark `integer`/`boolean` when the source
  itself coerces them).

## Request/response body schemas — the honest-gap principle

Only include a `type` for a field when the source actually tells you what it is (a literal
default value, an explicit type annotation/decorator, a validation-library schema field, a
DTO/serializer class field type, a JSON Schema in a Fastify route). When a field is read but
never gives away its type (e.g. `req.body.name` used only in a way that doesn't reveal type),
emit an empty schema `{}` (JSON Schema's "anything") for that field rather than guessing
`string` by default. A spec that honestly says "unknown" is more useful to a consumer than one
that confidently asserts a fabricated type — matches the same principle the accessibility
plugin applies to uncertain findings: say what you don't know rather than paper over it.

Prefer real schema sources when present, in this order of trust: a validation-library schema
(Zod/Joi/Yup/class-validator/Pydantic/DRF serializer/JSON Schema) > a typed
DTO/model/interface > destructured object pattern with literal defaults > raw property-access
usage in the handler body (weakest — gives you field *names* but not types).

## Responses

- Every operation needs at least one response; if none could be inferred, emit a generic
  `200: { description: "Successful response" }` rather than omitting responses entirely.
- Status code descriptions: use the standard HTTP reason phrase (200 Successful response, 201
  Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409
  Conflict, 422 Unprocessable Entity, 500 Internal Server Error) unless the source's own error
  message is more specific and worth surfacing instead.
- Attach a schema under `content.application/json.schema` only when one was actually inferred
  (per the honest-gap principle above) — a response entry with just a `description` and no
  `content` is a legitimate, honest output.

## Traceability annotations

On every operation, add:
```yaml
x-source-file: <path relative to the scanned project root>
x-source-line: <line number of the route registration/decorator>
```
and, when applicable:
```yaml
x-method-uncertain: true   # method couldn't be determined from source (route-patterns.md fallback cases)
x-field-names-uncertain: true   # multipart field names couldn't be pinned down (file-uploads.md)
```
These let a reader trace any documented operation straight back to the code that defines it,
and flag the specific spots where the spec is a best-effort inference rather than a confident
read — surface both flags in the final summary report too, not just in the spec's `x-`
extensions.

## YAML emission

If the resolved output format is YAML, emit it by hand with consistent 2-space indentation,
block style for objects/arrays (no flow-style `{ }`/`[ ]` except for genuinely empty
values), and double-quote only strings that need it (containing `:`, leading `*`/`&`/`!`,
looking like a number/bool, etc.) — plain scalars everywhere else. After writing, actually
verify it parses — see `diffing-and-fixes.md`'s "Verifying the write" section — rather than
just eyeballing the indentation.
