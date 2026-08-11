---
name: openapi-generate
description: Scans a project's source code (any backend stack — Express, Fastify, Koa, NestJS, Next.js, FastAPI, Flask, Django REST Framework, Rails, Laravel, Symfony, Spring, Go, ASP.NET Core, or a generic fallback) to discover its HTTP API surface and generates an OpenAPI 3.0 spec plus a self-contained, browsable Swagger UI page. Covers every HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS), path/query/header parameters, request/response body shapes, authorization requirements (bearer/JWT, API key, Basic, OAuth2, session/cookie), and multipart file-upload endpoints (single and multiple files). Use when asked to document an API, generate OpenAPI/Swagger docs, produce API reference documentation, or find/list all the endpoints in a project.
---

# OpenAPI generation

This skill resolves what to scan and where to write the output, then hands the real work off
to the **`openapi-generator`** subagent, which reads the source directly (no bundled scanner
tool — it reasons about routes the same way a person tracing the codebase would), classifies
auth and file-upload endpoints, builds the OpenAPI document, and generates a standalone
Swagger UI viewer.

## 1. Resolve scope

- Explicit path(s)/glob in the request → use them.
- "document my changes / the diff / this PR" → `git diff --name-only` (against the stated base
  branch, or the default branch if unstated), then pass the affected directories/files as
  scope — note to the agent that other, unchanged routes in the same files should still be
  captured for context (a diff scope narrows *what's new*, not what's worth reading).
- A directory, "the API", "the backend", or the whole project mentioned by name → discover
  under it.
- Nothing specified at all → ask which directory or project to scan. Don't default to scanning
  the whole repo silently — a monorepo with an unrelated frontend-only package would produce a
  misleading "no routes found" or a spec mixing unrelated services.

## 2. Resolve output preferences

- Spec output path: explicit path in the request → use it. Otherwise default to
  `openapi.json` at the root of the scanned project. If the request mentions "yaml", use
  `openapi.yaml` instead.
- Title/version: use if given in the request; otherwise let the agent infer a sensible title
  from the project (e.g. `package.json`'s `name`) and default the version to `0.1.0`.
- HTML viewer: generate `openapi-docs.html` next to the spec by default (this is what makes
  the API "checkable in browser," per the plugin's purpose) — skip it only if the request
  explicitly asks for the spec file alone with no viewer.

## 3. Delegate

Invoke the `openapi-generator` agent (Agent tool, matching subagent by name) with the resolved
scope, output path(s), title/version, and whether to generate the HTML viewer. Relay its
summary report (stack(s) detected, route counts, auth schemes, upload endpoints, any
uncertain/low-confidence routes, and the output file paths) back to the user directly — don't
re-run the discovery yourself in this skill.

## 4. Fallback if the agent isn't available

If the `openapi-generator` agent isn't available in the current environment (e.g. the plugin's
agent isn't registered), fall back to doing a **read-only** pass yourself:
1. `Read` `references/route-patterns.md`, `references/auth-and-security.md`, and
   `references/file-uploads.md` in full.
2. Identify the stack(s) and discover routes per those references, same discipline (`Grep` to
   find candidates, `Read` each matched file in full before recording anything).
3. Report the discovered routes, their methods/paths/auth/upload status, and any uncertain
   cases as a plain summary (a markdown table is fine) — don't attempt to write the OpenAPI
   spec file or the HTML viewer in the fallback path; that assembly work belongs to the
   dedicated agent, and half-emitting a spec file without the full authoring conventions in
   `references/openapi-authoring.md` would produce a worse artifact than no file at all.
