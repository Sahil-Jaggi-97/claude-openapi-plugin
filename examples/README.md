# Example fixtures

Small, self-contained projects for manually sanity-checking this plugin after editing its
instruction files (`skills/`, `agents/`, `commands/`). Since the plugin is pure prompt
engineering with no bundled parser, there's no automated test suite — re-running
`/openapi-generate` against these after a change is the fastest way to see whether route
discovery, auth classification, upload detection, and mounting still behave as documented.

Each fixture deliberately includes one plain route, one auth-protected route, and one
multipart-upload route, so a single run exercises all three reference files
(`route-patterns.md`, `auth-and-security.md`, `file-uploads.md`) at once.

- **`express-sample/`** — Express, bearer/JWT auth, `multer` upload, a root-mounted `public/`
  static folder (so a run against it should hit mounting Strategy 1, not Strategy 2).
- **`fastapi-sample/`** — FastAPI, API-key auth, `UploadFile` upload, no static-assets
  convention (so a run against it should hit mounting Strategy 2, and should also note FastAPI's
  own built-in `/docs`/`/redoc`).

These aren't meant to run in CI or be installed — `package.json`/`requirements.txt` exist only so
manifest-based stack detection (Step 2 of the agent) has something real to find.
