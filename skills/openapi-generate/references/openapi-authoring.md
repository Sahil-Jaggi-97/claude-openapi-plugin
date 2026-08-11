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
  - url: <base URL if one is confidently inferable — e.g. an Express app.listen(PORT) with a
      knowable default, or a documented base path; omit entirely rather than guessing localhost
      with a fabricated port>
tags:
  - name: <group name>
paths: { ... }
components:
  securitySchemes: { ... }   # only if at least one route uses auth — see auth-and-security.md
  schemas: { ... }           # optional: promote a request/response shape here and $ref it if
                              # the same shape repeats across 3+ operations; don't do this for
                              # one-off shapes, inline is clearer
```

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
looking like a number/bool, etc.) — plain scalars everywhere else. Validate mentally that the
result parses as valid YAML (consistent indentation, no tabs) before writing the file.
