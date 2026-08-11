# Changelog

## 2.0.0

Breaking changes to default behavior:

- **Mounting on the app's own port is now the default output**, not just a standalone `file://`
  page. The viewer is dropped into an existing root-mounted static-assets folder when the
  framework has one (no permission needed), or proposed as a small, permission-gated route
  addition to the app's bootstrap file otherwise. Say "file only" / "no mount" to get the old
  standalone-only behavior back. See `skills/openapi-generate/references/mounting-docs.md`.
- **The merged single-file bundle (`openapi.json`/`.yaml`) is no longer written by default** in
  multi-file mode — it duplicated the split source's content at the project root. The split
  `openapi/` source is now the only spec artifact on disk by default; the viewer's embedded spec
  is computed from it in memory instead. Say "also generate a merged bundle" if you need one for
  tooling that doesn't resolve external `$ref`s (Postman, codegen, CI linters).

Other changes:

- Mounted docs are reachable in whatever environment the app runs, including production, by
  default (no environment gating) — this is now stated explicitly in every run's summary. Say
  "dev only" / "gate it" to have the mount wrapped in the framework's own environment check
  instead.
- Strategy 1 (static-folder mounting) no longer overwrites a same-named file that isn't this
  plugin's own prior output — every generated viewer now carries a `generated-by:
  openapi-docs-plugin` marker comment used to tell a safe regeneration apart from a real
  collision.
- Strategy 2 (route-registration mounting) now checks the resolved route path against the app's
  own discovered routes first, so it won't propose a conflicting duplicate registration.
- The NestJS mounting snippet now distinguishes the Express vs. Fastify platform adapter instead
  of assuming Express.
- `servers:` now defaults to `[{ url: "/" }]` once mounting actually succeeds, so Swagger UI's
  "Try it out" works out of the box (relative requests resolve against the app's own origin).
  Resolving the mount outcome now happens *before* the viewer's spec is finalized, specifically
  so this can't go stale — if mounting was declined or turned out not to be applicable after
  already being provisionally assumed, the `servers:` entry is reconciled back out before the
  viewer is built, rather than leaving a URL that nothing is actually serving. The standalone
  fallback still omits `servers:`, and the report says explicitly that "Try it out" won't work
  there without a real reachable URL.
- Strategy 2's route-collision check no longer relies solely on the run's (possibly narrow)
  discovery scope — it also greps the specific bootstrap file being edited for the literal
  route path, so a conflicting route registered outside a narrowly-scoped run still gets caught.
- An audit run now flags a stale legacy root bundle (left over from before bundle-writing became
  opt-in) instead of silently ignoring it.
- Spec file writes are now actually parse-verified after every `Edit`/`Write` (preferring a real
  YAML/JSON parser via `Bash` when available), replacing the previous "validate mentally" advisory
  step.
- `marketplace.json`'s listing description now matches `plugin.json`'s.

## 1.1.0

Added the audit-and-fix workflow: diff freshly discovered routes against an existing OpenAPI
spec, classify findings as Missing/Broken/Stale, and propose+apply fixes one at a time with
explicit permission.

## 1.0.0

Initial release: scans a project's source for its HTTP API surface (all methods, path/query/
header params, request/response bodies, auth requirements, multipart file uploads) and generates
an OpenAPI 3.0 spec plus a self-contained Swagger UI page.
