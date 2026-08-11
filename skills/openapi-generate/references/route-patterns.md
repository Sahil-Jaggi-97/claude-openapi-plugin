# Route discovery patterns by stack

Source of truth for what to `Grep` for when discovering HTTP routes. Identify the stack first
(manifest file presence + dominant source extensions — see `SKILL.md` / the agent's Step 3),
then use the matching section below. A project can have more than one stack (e.g. a Next.js
frontend calling a separate Python backend in the same repo) — run every section that applies.

General discipline: `Grep` finds candidate lines; always `Read` the containing file in full
before recording a route. A grep hit only tells you a pattern exists, not the full method set,
middleware chain, or body shape — those require reading the surrounding code.

---

## Node.js / TypeScript

### Express
- `app.get/post/put/patch/delete/head/options/all(path, ...handlers)` and the same on any
  variable that looks like a router (`router.get(...)`, `usersRouter.post(...)`).
- Chained form: `router.route(path).get(h1).post(h2).delete(h3)`.
- Sub-router mounting: `app.use(prefix, subRouter)` / `router.use(prefix, subRouter)` — the
  final path is the mount prefix joined with the sub-router's own path. Trace `require`/
  `import` to find the sub-router's file.
- Path params: Express `:id` syntax → OpenAPI `{id}`.
- Middleware/guards are every handler-list argument before the last one; the last argument is
  the terminal handler. Named middleware identifiers matter for auth classification (see
  `auth-and-security.md`).
- Grep seeds: `\.(get|post|put|patch|delete|head|options|all)\(`, `router\.route\(`, `\.use\(`

### Fastify
- `fastify.get/post/put/patch/delete/head/options(path, [opts], handler)` or
  `fastify.route({ method, url, handler, schema })`.
- `method` in the route-object form can be a string or an array of strings (one route, several
  methods).
- Path params: `:id` → `{id}`, same as Express.
- Schema-based validation: if a route has an inline `schema: { body, querystring, params,
  response }` (JSON Schema), use it directly — it's a much stronger signal than inferring from
  handler body usage.
- Grep seeds: `fastify\.(get|post|put|patch|delete|head|options)\(`, `\.route\(\{`, `schema:\s*\{`

### Koa (with `@koa/router` or `koa-router`)
- `router.get/post/put/patch/delete(path, ...middleware, handler)` — same shape as Express.
- Grep seeds: `router\.(get|post|put|patch|delete)\(`

### NestJS
- Controller-level prefix: `@Controller('users')` class decorator.
- Method-level route: `@Get()`, `@Post(':id')`, `@Put(':id')`, `@Patch(':id')`, `@Delete(':id')`,
  `@Head()`, `@Options()` decorators on class methods — path is the controller prefix joined
  with the decorator's argument (empty if omitted).
- Params come from `@Param('id')`, `@Query('q')`, `@Body()`, `@Headers('x-api-key')` decorators
  on method parameters; `@Body()` with a DTO class type gives a real request body shape — read
  the DTO class (its `class-validator` decorators like `@IsString()`, `@IsOptional()` map
  directly to OpenAPI property types/required-ness).
- Guards (`@UseGuards(AuthGuard)`, applied at class or method level) are the auth signal — see
  `auth-and-security.md`.
- Grep seeds: `@Controller\(`, `@(Get|Post|Put|Patch|Delete|Head|Options)\(`, `@UseGuards\(`, `@Body\(`

### Next.js — App Router
- File-based: `app/**/route.ts` (or `.js`). Each exported function named `GET`, `POST`, `PUT`,
  `PATCH`, `DELETE`, `HEAD`, `OPTIONS` is one operation on the path implied by the directory
  structure relative to `app/` (or `src/app/`), with `[id]` → `{id}`, `[...slug]` → a catch-all
  (represent as a single `{slug}` path param and note the catch-all behavior in the
  description), and `(group)` segments dropped (route groups don't affect the URL).
- Request body: `await request.json()`. Query params: `request.nextUrl.searchParams.get(...)`.
  Response: `NextResponse.json(data, { status })` or `new Response(body, { status })`.
- Grep seeds: `export (async )?function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)`, `route\.(ts|js)$` (file name)

### Next.js — Pages Router
- File-based: `pages/api/**` (or `src/pages/api/**`). Default export is the handler for every
  method unless the function body branches on `req.method` (`if (req.method === 'POST')` or
  `switch (req.method)`) — in that case each branch is a separate operation.
- If no method branching exists at all, the route accepts any method; document it as a single
  operation and note in its description that the method wasn't determined from source (don't
  silently default to GET without saying so).
- File → path: `pages/api/users/[id].ts` → `/api/users/{id}`; `index.ts` → parent path.
- Grep seeds: `export default (async )?function`, `req\.method`

### Plain Node.js `http`/`https`
- `http.createServer((req, res) => { ... })` with manual `if (req.url === '...' && req.method
  === '...')` or `switch (req.url)` branching.
- Weakest signal of any stack here — path matching is often prefix-based or regex-based, not
  literal. Record what's literally comparable; if the URL is matched via regex or
  `startsWith`, note the route as best-effort/uncertain rather than fabricating an exact path.
- Grep seeds: `createServer\(`, `req\.url`, `req\.method`

---

## Python

### FastAPI
- `@app.get/post/put/patch/delete/head/options("/path")` or the same on an
  `APIRouter()` instance, decorators directly above the handler function.
- `APIRouter(prefix="/users")` + `app.include_router(router)` — join prefixes.
- Parameters are the handler's own function signature: plain typed params not in the path are
  query params; a parameter typed as a Pydantic `BaseModel` is the request body (read the model
  class for its field types/`Optional`/defaults → required-ness); `Depends(...)` params are
  dependencies — an auth dependency (commonly named `get_current_user`, `oauth2_scheme`, or
  typed `OAuth2PasswordBearer`/`HTTPBearer`) is the auth signal, see `auth-and-security.md`.
  `UploadFile`-typed params are file uploads, see `file-uploads.md`.
- Response model: `response_model=` decorator kwarg, or the return type annotation.
- Grep seeds: `@(app|router)\.(get|post|put|patch|delete|head|options)\(`, `APIRouter\(`, `Depends\(`, `UploadFile`

### Flask
- `@app.route("/path", methods=["GET", "POST"])` (default method is GET if `methods` omitted)
  or the shorthand `@app.get("/path")` / `@app.post("/path")` (Flask 2+).
- Blueprints: `Blueprint("name", __name__, url_prefix="/users")` registered via
  `app.register_blueprint(bp)` — join the prefix.
- Body: `request.json` / `request.get_json()` / `request.form`. Query: `request.args.get(...)`.
  Files: `request.files[...]`, see `file-uploads.md`.
- Auth: a decorator above the route function (commonly `@login_required`,
  `@jwt_required()`, `@require_auth`) — see `auth-and-security.md`.
- Grep seeds: `@(app|bp|blueprint)\.route\(`, `@(app|bp)\.(get|post|put|patch|delete)\(`, `Blueprint\(`

### Django REST Framework
- Function-based views: `@api_view(['GET', 'POST'])` decorator, path comes from `urls.py`
  (`path('users/<int:id>/', view_func)` or the older `re_path`/`url` with a regex).
- Class-based views: a `ViewSet`/`APIView` subclass; methods named `list`, `create`,
  `retrieve`, `update`, `partial_update`, `destroy` map to GET(list)/POST/GET(detail)/PUT/
  PATCH/DELETE respectively when routed through a `DefaultRouter`; explicit
  `def get/post/put/patch/delete(self, request, ...)` methods on an `APIView` map directly.
- Always cross-reference `urls.py` (`urlpatterns`) to get the actual path — the view file alone
  usually doesn't have it.
- Serializers (`serializers.Serializer`/`ModelSerializer` subclasses) give real request/response
  body shapes — read the referenced serializer class.
- Permission classes (`permission_classes = [IsAuthenticated]`, `@permission_classes([...])`)
  are the auth signal.
- Grep seeds: `@api_view\(`, `class .*\(.*View`, `permission_classes`, `urlpatterns`

---

## Ruby on Rails
- Routes are declared in `config/routes.rb`: `get`, `post`, `put`, `patch`, `delete` DSL calls,
  or `resources :users` (expands to the standard 7 RESTful routes — index=GET collection,
  create=POST collection, show=GET member, update=PUT/PATCH member, destroy=DELETE member, plus
  new/edit for HTML forms which you can skip for an API-only app).
- The controller action referenced (`to: 'users#index'`) is the handler — read the matching
  `app/controllers/*_controller.rb` action method for body/param handling
  (`params.require(...).permit(...)` is the request body shape signal) and `before_action
  :authenticate_user!`-style filters for auth.
- Grep seeds: `resources :`, `get \'`, `post \'`, `before_action`

## PHP — Laravel
- Routes in `routes/api.php` (or `routes/web.php`): `Route::get/post/put/patch/delete($path,
  $handler)`, or `Route::resource('users', UserController::class)` (expands to the standard
  RESTful set, same mapping as Rails' `resources`).
- Handler is either a closure (read inline) or `[Controller::class, 'method']` / a controller
  string — read the matching method in `app/Http/Controllers/`.
- Middleware: `->middleware('auth:sanctum')` / `->middleware('auth:api')` chained on the route,
  or applied to a `Route::middleware([...])->group(...)` block — auth signal.
- Grep seeds: `Route::(get|post|put|patch|delete|resource)\(`, `->middleware\(`

## PHP — Symfony
- `#[Route('/path', methods: ['GET', 'POST'])]` PHP attribute directly above a controller
  method (or the older `@Route()` annotation / YAML route config — attributes are current
  default).
- Auth: `#[IsGranted('ROLE_USER')]` attribute, or a security firewall config in
  `config/packages/security.yaml` (harder to trace per-route; note as best-effort).
- Grep seeds: `#\[Route\(`, `#\[IsGranted\(`

## Java / Kotlin — Spring (Boot / MVC)
- `@RestController` (or `@Controller` + `@ResponseBody`) class, `@RequestMapping("/users")` at
  class level for a path prefix.
- `@GetMapping`/`@PostMapping`/`@PutMapping`/`@PatchMapping`/`@DeleteMapping` (path as the
  annotation's value, or omitted to inherit the class prefix as-is), or the more verbose
  `@RequestMapping(value = "/path", method = RequestMethod.GET)`.
- Params: `@PathVariable`, `@RequestParam`, `@RequestHeader`, `@RequestBody` (typed to a DTO
  class — read it for field shape), `@RequestPart`/`MultipartFile` for uploads (see
  `file-uploads.md`).
- Auth: `@PreAuthorize("...")` method annotation, or a `SecurityFilterChain`
  bean/`WebSecurityConfigurerAdapter` class configuring which paths require authentication
  (harder to trace per-route from the controller alone — note as best-effort if only the
  global config is found, not a per-route annotation).
- Grep seeds: `@RestController`, `@RequestMapping\(`, `@(Get|Post|Put|Patch|Delete)Mapping\(`, `@PreAuthorize\(`

## Go
- **net/http** (stdlib): `mux.HandleFunc("/path", handler)` or `http.HandleFunc(...)`; method
  is usually branched inside the handler via `if r.Method == http.MethodGet`/`switch r.Method`
  (same weak-signal caveat as plain Node `http`) unless using Go 1.22+'s
  `mux.HandleFunc("GET /path", handler)` method-prefixed pattern, which is unambiguous — prefer
  that form when present.
- **gin**: `router.GET/POST/PUT/PATCH/DELETE("/path", handler)`, groups via
  `router.Group("/users")`.
- **echo**: `e.GET/POST/PUT/PATCH/DELETE("/path", handler)`, groups via `e.Group("/users")`.
- **chi**: `r.Get/Post/Put/Patch/Delete("/path", handler)`, `r.Route("/users", func(r
  chi.Router) {...})` for groups, `r.Use(middleware)` for auth.
- Path params: `:id` (gin/echo/chi) or `{id}` (chi, net/http 1.22+) → OpenAPI `{id}` either way.
- Grep seeds: `\.(GET|POST|PUT|PATCH|DELETE)\(`, `HandleFunc\(`, `\.Group\(`

## C# — ASP.NET Core
- **Minimal APIs**: `app.MapGet/MapPost/MapPut/MapPatch/MapDelete("/path", handler)`.
- **Controllers**: `[ApiController]` class with `[Route("api/[controller]")]`, methods
  decorated `[HttpGet]`/`[HttpPost]`/`[HttpPut]`/`[HttpPatch]`/`[HttpDelete]` (optionally with a
  path argument appended to the class route).
- Params: `[FromRoute]`, `[FromQuery]`, `[FromBody]` (typed to a model class — read it),
  `[FromForm] IFormFile`/`IFormFileCollection` for uploads (see `file-uploads.md`).
- Auth: `[Authorize]` attribute (class or method level), optionally with a
  `Roles=`/`Policy=` argument worth noting in the description.
- Grep seeds: `\[Http(Get|Post|Put|Patch|Delete)`, `app\.Map(Get|Post|Put|Patch|Delete)\(`, `\[Authorize`

---

## Generic fallback (unlisted stack or framework)

When the detected stack isn't covered above:
1. Look for HTTP-method keywords (`GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`/`OPTIONS`, in any
   case) sitting next to a string that looks like a URL path (starts with `/`, may contain
   `:param` or `{param}` or `<param>` placeholders) — as a decorator argument, a function call
   argument, or a routing-table/config entry.
2. Look for a routing decorator/annotation pattern generically: `@` (Python/Java/C#) or `#[...]`
   (PHP/Rust) immediately above a function/method whose name or argument references a path and
   method.
3. If a route's method genuinely can't be determined with confidence, don't guess GET silently
   — record it with a clear "method could not be determined from source" note in the operation
   description (mirrored in the final report's uncertain-routes list) rather than fabricating
   certainty the discovery didn't earn.
4. If no routing pattern is found at all for a given directory, say so plainly in the report —
   don't strain to invent findings from an unfamiliar stack.
