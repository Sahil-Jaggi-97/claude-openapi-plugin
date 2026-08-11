# Mounting the docs viewer on the app's own port

Default behavior: the generated Swagger UI viewer is mounted into the running app itself, at
`/api-docs` (or whatever route path the caller resolved), so it's reachable on the app's own
port — no separate process, no separate port to publish in Docker/Compose. A plain standalone
`openapi-docs.html` (opened via `file://`, no server) is still produced whenever mounting isn't
possible, isn't applicable (no runnable server stack was found in scope), or the caller opted
out of mounting.

Two strategies, tried in this order. **Never skip straight to the code-edit fallback** without
first checking whether a root-mounted static-assets convention already satisfies the request —
it usually needs no permission and never touches app source (the only exception is a genuine
file collision — see Strategy 1 below).

**Security note, both strategies**: mounting isn't environment-gated by default — the route/file
is reachable in whatever environment the app runs in, including production, since gating it
would silently break the exact Docker/deployed use case this feature exists for. The generated
page exposes the full discovered API surface (every path, and each route's auth *mechanism*,
though never actual credentials/secrets) to anyone who can reach that route. Always say this
plainly in the final report (see "Reporting" below), and if the caller says "dev only" / "gate
it" / "not in production", wrap the mount in the framework's own environment check instead of
mounting unconditionally — per each snippet's "Dev-only gating" note below.

## Strategy 1 — drop into an existing root-mounted static folder (usually no permission needed)

Applies only when the framework already serves a static-assets directory **at the URL root
(`/`)** — not a sub-path like `/static`. Only then does writing a file into that directory land
it at exactly the requested route. Check per stack:

| Stack | Root-mounted static dir? | Convention |
| --- | --- | --- |
| Next.js (Pages or App Router) | Yes, always | `public/` is served at `/` automatically — no code needed |
| Ruby on Rails | Yes, by default | `public/` is served at `/` by Rack/Puma |
| Laravel | Yes, by default | `public/` is the document root |
| Symfony | Yes, by default | `public/` is the document root |
| Spring Boot | Yes, by default | `src/main/resources/static/` (or `/public/`, `/resources/`, `/META-INF/resources/`) served at `/` when `spring-boot-starter-web` is present and `spring.mvc.static-path-pattern` wasn't narrowed |
| ASP.NET Core | Only if `app.UseStaticFiles()` is called with no custom `RequestPath` | `wwwroot/` served at `/` — grep `Program.cs`/`Startup.cs` to confirm no custom prefix was set |
| Express / Fastify / Koa / NestJS | Only if `express.static(dir)` / `@fastify/static` / `koa-static` / `useStaticAssets` is registered with **no** path prefix argument (e.g. `app.use(express.static('public'))`, not `app.use('/static', express.static('public'))`) | Grep for the registration call; read its prefix argument (if any) |
| FastAPI / Flask / Django | Rarely — their static conventions default to a `/static` prefix, not root | Only qualifies if the app explicitly mounts `StaticFiles(...)` / configures `static_url_path` / `STATIC_URL` as `/` itself |

If the stack qualifies: before writing, `Read` `<static-dir>/<route-name>.html` if it already
exists. Every copy this plugin writes carries an
`<!-- generated-by: openapi-docs-plugin -->` marker comment (from the template — see
`swagger-ui-template.html`); a file bearing that marker is this plugin's own prior output and is
always safe to overwrite silently, no matter how it changed since. A file that exists at that
path *without* the marker is something else entirely — a real page the app already owns that
happens to share the name — so treat that collision like a Strategy-2 edit: tell the caller
what's already there and ask before overwriting (or use a different route-name hint instead).

Once clear to write: `Write` the generated viewer to `<static-dir>/<route-name>.html` (e.g.
`public/api-docs.html`) — flat file, not a directory with an `index.html`, since not every
static-file server resolves a bare directory path to its index file by default (Next.js's
`public/` and ASP.NET's default `UseStaticFiles()` notably don't). The real reachable URL is
therefore `/<route-name>.html`, not the bare `/<route-name>` — report that exact URL to the
user rather than implying the extension-less path works.

This step needs **no permission** beyond the collision check above — writing (or regenerating)
this plugin's own artifact is the same category of fully-derived-artifact write as generating
`openapi-docs.html` itself in the file-only path; only a genuine collision with someone else's
file changes that.

## Strategy 2 — add an explicit route (needs explicit permission)

Applies whenever Strategy 1 doesn't (no root-mounted static dir, or the caller specifically
wants the exact extension-less path). This edits real application source — a different category
of change from writing spec/viewer artifacts, so it always requires an explicit yes before
touching the file, the same permission gate as a Missing/Broken/Stale fix in
`diffing-and-fixes.md` Step 5, even outside an audit run.

1. Identify the app's main bootstrap/router file — the same file(s) already read during route
   discovery (Step 4 of the agent) that call `app.get`/`@Controller`/`@app.route`/etc.
2. Check for a collision, two ways — don't rely on either alone:
   - Against the operations already discovered in Step 4 of the agent. This alone isn't
     sufficient: Step 4 only sees routes inside whatever scope this run resolved, so a
     narrowly-scoped run (e.g. pointed at one subdirectory) wouldn't have discovered a
     conflicting route registered elsewhere in the same app.
   - `Grep` the specific bootstrap file identified in step 1 for the literal resolved route path
     string (e.g. `'/api-docs'`) — this file gets `Read` in full regardless of the run's scope
     (it's about to be edited below), so this check isn't scope-limited the way Step 4's
     discovery is.

   If either check finds a real route already at that exact path, don't propose registering a
   second, conflicting handler there — tell the caller plainly ("`/api-docs` is already a route
   in this app, at `<file>:<line>`") and either use a different route-name hint or ask which
   path to use instead, before continuing.
3. Compute the relative path from that file to the generated `openapi-docs.html` at its output
   location (usually the scanned project's root).
4. Show the caller the exact snippet and its insertion point (near the other route
   registrations in that file, not at the top or bottom arbitrarily) before asking — mention
   whether it's unconditional or dev-only-gated per the caller's preference (see the security
   note above).
5. On explicit approval, make one narrowly-scoped `Edit` — add only the new route registration
   (plus an import it strictly needs, e.g. `path`/`fs` in Node, if not already imported) —
   nothing else in the file changes.
6. On decline: fall back to the plain standalone `openapi-docs.html` (report the `file://` path
   as usual) rather than leaving the caller with nothing.

Read the file's own content each time before writing the snippet — these are illustrative
shapes, not literal text to paste blind (existing import style, `const`/`import`, indentation,
router variable name, etc. must match the file).

### Express
```js
app.get('/api-docs', (req, res) => {
  res.sendFile(path.join(__dirname, '<relative-path-to>/openapi-docs.html'));
});
```
Needs `path` imported (`const path = require('path');` / `import path from 'path';`) if not
already present in the file. **Dev-only gating (if requested)**: wrap the registration —
`if (process.env.NODE_ENV !== 'production') { app.get('/api-docs', ...); }`.

### Fastify
```js
fastify.get('/api-docs', (request, reply) => {
  reply.type('text/html').send(fs.readFileSync(path.join(__dirname, '<relative-path-to>/openapi-docs.html'), 'utf8'));
});
```
Needs `fs` and `path` imported if not already present. **Dev-only gating (if requested)**: same
`if (process.env.NODE_ENV !== 'production') { ... }` wrap around the registration.

### Koa (`@koa/router`/`koa-router`)
```js
router.get('/api-docs', (ctx) => {
  ctx.type = 'html';
  ctx.body = fs.readFileSync(path.join(__dirname, '<relative-path-to>/openapi-docs.html'), 'utf8');
});
```
**Dev-only gating (if requested)**: same `if (process.env.NODE_ENV !== 'production') { ... }`
wrap around the registration.

### NestJS
First check which HTTP adapter the app bootstraps in `main.ts` — the two platforms have
different `Response` types and don't share a `sendFile` call shape:

**Express adapter** (default — `NestFactory.create(AppModule)` with no explicit adapter, or
`@nestjs/platform-express` referenced):
```ts
import { Response } from 'express';

@Get('api-docs')
getApiDocs(@Res() res: Response) {
  res.sendFile(join(__dirname, '<relative-path-to>/openapi-docs.html'));
}
```
Needs `@Res()` (from `@nestjs/common`), `Response` (from `express`), and `join` (from `path`)
imported.

**Fastify adapter** (`NestFactory.create<NestFastifyApplication>(AppModule, new
FastifyAdapter())`, or `@nestjs/platform-fastify` referenced):
```ts
import { FastifyReply } from 'fastify';

@Get('api-docs')
getApiDocs(@Res() res: FastifyReply) {
  return res.type('text/html').send(readFileSync(join(__dirname, '<relative-path-to>/openapi-docs.html'), 'utf8'));
}
```
Needs `@Res()` (from `@nestjs/common`), `FastifyReply` (from `fastify`), `readFileSync` (from
`fs`), and `join` (from `path`) imported — Fastify's reply object has no `sendFile` without
`@fastify/static` registered, so read-and-send avoids adding that dependency just for this.

Either adapter: add to an existing controller (e.g. `AppController`) rather than creating a new
one, unless none exists in scope. **Dev-only gating (if requested)**: guard the method body's
first line — `if (process.env.NODE_ENV === 'production') { res.status(404).send(); return; }` —
rather than trying to conditionally apply the `@Get()` decorator itself.

### FastAPI
```python
from fastapi.responses import HTMLResponse

@app.get("/api-docs", response_class=HTMLResponse)
def api_docs():
    with open("<relative-path-to>/openapi-docs.html") as f:
        return f.read()
```
Note in the report that FastAPI already serves its own interactive docs at `/docs` (and
`/redoc`) out of the box — this route is the plugin's independently-generated spec (grounded in
source reading, same as every other stack this plugin covers), not a replacement for FastAPI's
built-in one; mention both exist so the caller isn't confused by two docs UIs. **Dev-only
gating (if requested)**: wrap the whole `@app.get(...)` block in
`if os.getenv("ENVIRONMENT", "development") != "production":` (adjust the env var name to
whatever the project already uses, if one is evident from its config/settings).

### Flask
```python
@app.route("/api-docs")
def api_docs():
    with open("<relative-path-to>/openapi-docs.html") as f:
        return f.read()
```
**Dev-only gating (if requested)**: wrap the whole `@app.route(...)` block in
`if app.debug:` (or the project's own env-var convention if one is evident).

### Django REST Framework
Add to `urls.py`:
```python
from django.http import HttpResponse

def api_docs(request):
    with open("<relative-path-to>/openapi-docs.html") as f:
        return HttpResponse(f.read())

urlpatterns += [path("api-docs", api_docs)]
```
**Dev-only gating (if requested)**: `if settings.DEBUG: urlpatterns += [path("api-docs", api_docs)]`.

### Go
- **net/http**: `mux.HandleFunc("/api-docs", func(w http.ResponseWriter, r *http.Request) { http.ServeFile(w, r, "<relative-path-to>/openapi-docs.html") })`
- **gin**: `router.StaticFile("/api-docs", "<relative-path-to>/openapi-docs.html")`
- **echo**: `e.File("/api-docs", "<relative-path-to>/openapi-docs.html")`
- **chi**: same shape as net/http's `mux.HandleFunc`.
- **Dev-only gating (if requested)**: wrap the registration in
  `if os.Getenv("APP_ENV") != "production" { ... }` (adjust the env var name to whatever the
  project already uses, if one is evident).

### ASP.NET Core (Minimal APIs)
```csharp
app.MapGet("/api-docs", async () => Results.Content(await File.ReadAllTextAsync("<relative-path-to>/openapi-docs.html"), "text/html"));
```
**Dev-only gating (if requested)**: wrap the registration —
`if (app.Environment.IsDevelopment()) { app.MapGet("/api-docs", ...); }` — ASP.NET Core's own
built-in idiom for exactly this.

### Generic fallback (unlisted stack)
If the stack has no snippet above, describe the two things any web framework's routing needs —
a handler that reads `openapi-docs.html`'s contents and returns it with an HTML content type,
registered at the resolved route path — and ask the caller to confirm the equivalent call in
their framework rather than guessing unfamiliar syntax.

## Reporting

Whichever strategy applied, the final summary (agent Step 9) states plainly:
- Which strategy was used, and the exact reachable path (`/api-docs.html` for Strategy 1,
  `/api-docs` for Strategy 2).
- That it resolves on the app's own host/port (so it needs no separate port published in
  Docker/Compose — but the file **does** need to exist inside the image/container, so a rebuild
  or bind-mount may be needed if `openapi-docs.html` was generated after the image was last
  built).
- The security note from the top of this file: this route/file is reachable in whatever
  environment the app runs, including production, unless dev-only gating was requested and
  applied — say which is the case for this run.
- If Strategy 1 found a same-named file without this plugin's marker (a real collision, not a
  regen), that it was left untouched pending the caller's choice, instead of silently
  overwritten.
- If Strategy 2's collision check found an existing route at the resolved path, that mounting
  was skipped/redirected to a different path for that reason.
- Only if Strategy 2 was declined (or Strategy 1 hit an unresolved collision) — the `file://`
  path of the standalone fallback instead.
