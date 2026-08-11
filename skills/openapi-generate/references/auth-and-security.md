# Auth pattern → OpenAPI securityScheme mapping

**Don't apply a blanket "any auth-sounding middleware name → bearer" heuristic.** A name like
`authMiddleware` or `requireAuth` tells you a route is protected, but not *how* — that requires
looking at what the middleware/guard/decorator actually does. When a route is flagged as
protected but the mechanism isn't obvious from the name alone, `Read` the referenced
middleware/guard/dependency function before deciding which scheme applies. Getting this wrong
(e.g. documenting an API-key endpoint as bearer-JWT) actively misleads whoever tries the "Try
it out" panel, so it's worth the extra read.

## Recognizing the mechanism

**Bearer / JWT** (`type: http, scheme: bearer, bearerFormat: JWT`)
- Reads/verifies an `Authorization: Bearer <token>` header.
- Signals: `jsonwebtoken`/`jwt.verify`/`jwt.sign` (Node), `PyJWT`/`jwt.decode` (Python),
  `jjwt`/`Jwts.parser()` (Java), `System.IdentityModel.Tokens.Jwt` (C#), a Passport.js
  `JwtStrategy`, NestJS `@nestjs/jwt` / `AuthGuard('jwt')`, FastAPI `OAuth2PasswordBearer` +
  `jwt.decode`, Spring `@PreAuthorize` combined with a JWT filter bean.

**API key** (`type: apiKey, in: header|query, name: <actual header/query param name>`)
- Reads a custom header (commonly `X-API-Key`, `X-Api-Key`, `Api-Key`) or a query string
  parameter, and compares it against a stored/env value — no token *decoding*, just a direct
  compare/lookup.
- Always record the exact header/query parameter name found in source as `name:` — don't
  default to a guessed header name.

**Basic auth** (`type: http, scheme: basic`)
- Reads `Authorization: Basic <base64>` and decodes user:password, or a framework's built-in
  basic-auth middleware (Express `basic-auth`/`express-basic-auth`, Flask
  `flask_httpauth.HTTPBasicAuth`, ASP.NET `AddAuthentication(...).AddBasic(...)`).

**OAuth2** (`type: oauth2`, with the appropriate flow under `flows:`)
- Passport.js OAuth strategies (Google/GitHub/etc.), FastAPI `OAuth2PasswordBearer` used with an
  actual `/token` issuance endpoint (as opposed to just using the class as a bearer-token
  extractor, which is common and doesn't necessarily mean a full OAuth2 flow is implemented —
  check whether a token endpoint exists before committing to `oauth2` over plain `bearer`),
  Spring Security OAuth2 client/resource-server config, `django-oauth-toolkit`.
- If you can't determine the actual flow (`authorizationCode`/`clientCredentials`/`password`/
  `implicit`) and token URLs, fall back to documenting it as bearer auth and note in the
  route's description that a fuller OAuth2 flow appears to be in use but couldn't be resolved
  from static reading — don't fabricate flow URLs.

**Cookie / session** (`type: apiKey, in: cookie, name: <session cookie name>`)
- `express-session`, Flask/Django's built-in session auth, Rails `session[:user_id]`,
  ASP.NET Cookie authentication scheme. Find the actual cookie name if set explicitly
  (`name:` option); otherwise use the framework's documented default
  (`connect.sid` for `express-session`, `sessionid` for Django, `_session_id`-style for Rails —
  verify against the project's own config rather than assuming).

## Applying it to routes

- A route is "protected" when it has an auth middleware/guard/decorator/dependency in its
  chain (see each stack's section in `route-patterns.md` for where to look — Express
  middleware args, NestJS `@UseGuards`, FastAPI `Depends(...)`, Spring `@PreAuthorize`, Laravel
  `->middleware('auth:...')`, ASP.NET `[Authorize]`, etc.).
- Add `security: [{ <schemeName>: [] }]` to that operation, and a matching entry under
  `components.securitySchemes` in the document (built once, reused via the scheme name across
  every operation that needs it — don't duplicate the scheme definition per-route).
- If a project uses more than one mechanism (e.g. a public API-key-authenticated set of routes
  plus an internal bearer-JWT-authenticated set), define both schemes and apply the correct one
  per route — don't collapse them into one.
- Role/scope hints found alongside the auth check (`@PreAuthorize("hasRole('ADMIN')")`,
  `Roles=` on `[Authorize]`, a Laravel `can:` middleware, a NestJS `@Roles('admin')` decorator)
  are worth surfacing in the operation's description even though OpenAPI's `security` block
  itself doesn't carry role granularity well outside OAuth2 scopes.
- If no auth mechanism is found anywhere in the project, omit `components.securitySchemes`
  entirely rather than adding an empty/unused scheme.
