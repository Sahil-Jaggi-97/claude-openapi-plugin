# Demo script — openapi-docs plugin

A ~10-minute walkthrough using `demo/sample-express-app`, a tiny fixture Express API (never
installed or run) seeded to exercise every method, an auth-mechanism mix, and both single- and
multi-file uploads in one pass.

## Before you demo

- [ ] Plugin installed: `claude --plugin-dir /path/to/claude-openapi-plugin` (session-only) or
      `/plugin install openapi-docs@openapi-docs-marketplace`
- [ ] Know the path to `demo/sample-express-app` on the demo machine
- [ ] A browser available to open the generated `openapi-docs.html` (needs internet once, to
      load Swagger UI from a CDN)

## 1. Open with the problem (30 sec)

"Most OpenAPI generators need annotations you write by hand, or a decorator-heavy framework
they're hardcoded for. This plugin reads the code you already have — any backend stack — and
writes the spec for you, including the parts people usually skip: which auth mechanism each
route actually uses, and which endpoints accept file uploads."

## 2. Trigger it (1 min)

```
/openapi-generate demo/sample-express-app
```

or natural language: *"Generate OpenAPI docs for demo/sample-express-app"*

## 3. Let the report land (3-4 min)

`sample-express-app` is seeded to trip every category in one pass:

- **`GET`/`HEAD /api/health`** — plain, unauthenticated. *"Both verbs on the same path, because
  the source declares both explicitly."*
- **`GET /api/users`, `GET /api/users/:id`** — public, with `:id` correctly turned into an
  OpenAPI `{id}` path parameter, and `?limit=`/`?offset=` picked up as query params from
  `req.query` usage.
- **`POST /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id`** — all behind
  `jwtAuth`. *"It didn't just see a middleware named `jwtAuth` and assume bearer — it read the
  middleware, saw `jwt.verify` against an `Authorization: Bearer` header, and classified it
  correctly."*
- **`GET /api/documents`, `PUT /api/documents/:id`** — behind `apiKeyAuth` instead. *"Same
  project, a second auth scheme — it reads `x-api-key` and does a direct comparison, no token
  decoding, so it's classified as `apiKey`, not bearer. Two schemes, two entries in
  `components.securitySchemes`, applied correctly per route."*
- **`POST /api/users/:id/avatar`** — a single-file upload (`upload.single("avatar")`).
  Documented as `multipart/form-data` with one `avatar` field, `type: string, format: binary`.
- **`POST /api/documents/upload`** — a multi-file upload under one field
  (`upload.array("files", 10)`). Documented as `multipart/form-data` with a `files` field typed
  as an array of binaries.

**Talking point:** every operation carries `x-source-file`/`x-source-line` pointing straight
back to the route in `demo/sample-express-app`, so nothing in the spec is unaccountable.

## 4. Open the browsable doc (2 min)

Open the generated `openapi-docs.html` directly in a browser (no server, just the file). Show
the "Try it out" panel on `POST /api/users` — the bearer-auth lock icon, the request body
schema — and on `POST /api/documents/upload` — the file-picker widget Swagger UI renders
automatically for a `format: binary` field.

## 5. Show the honesty boundary (1 min)

Point out that fields it genuinely couldn't type (e.g. a body property only ever passed
through, never given a literal or validated type) show up as an empty/untyped schema rather
than a guessed `string` — and that any route whose method or upload field names couldn't be
pinned down gets flagged in the report and tagged `x-method-uncertain`/
`x-field-names-uncertain` in the spec itself, not silently presented as fact.

## 6. Close on portability (30 sec)

*"This never touched the target project — no dependencies added, no config changed, just two
new files: the spec and the viewer. And because it works by reading code rather than running a
framework-specific parser, the same plugin covers a Python or Go or Java backend just as well
as this Express one — see `references/route-patterns.md` for the full stack list."*

---

## Anticipated questions

- **"Does it need the app running?"** No — pure static source reading, same as the spec file
  and viewer generation. No server is started, no dependency is installed into the target
  project.
- **"What if my framework isn't in the reference list?"** `references/route-patterns.md` has a
  generic fallback (HTTP-method keyword next to a path-like string, or a routing
  decorator/annotation pattern), and it says explicitly when a route's method couldn't be
  confidently determined rather than defaulting silently to GET.
- **"Can I get YAML instead of JSON?"** Yes — `/openapi-generate demo/sample-express-app
  --format yaml` or just say "as yaml" in the request.
- **"Does the HTML viewer work offline?"** The spec is embedded inline, so no server or fetch
  is needed for that part, but Swagger UI's own JS/CSS load from a CDN — it needs internet
  access the first time it's opened (cached by the browser after).
