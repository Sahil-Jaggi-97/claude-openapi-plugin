---
description: Scan a project (or a given path/diff) for its HTTP API surface and generate an OpenAPI 3.0 spec plus a browsable Swagger UI page
---

Arguments: $ARGUMENTS

Parse `$ARGUMENTS` for a file/directory/glob scope plus optional hints:
- Output format/path: "yaml" → `openapi.yaml`; an explicit output path/filename → use it as
  given. Nothing said → default `openapi.json`.
- Title/version: an explicit API title and/or version mentioned → use them. Nothing said → let
  the agent infer a title from the project and default the version to `0.1.0`.
- Viewer: "spec only" / "no html" / "skip the viewer" → don't generate the Swagger UI page.
  Nothing said → generate it by default (that's what makes the API browsable, per this
  plugin's purpose).
- "my changes" / "the diff" / "this PR" → scope to the current diff (skill/agent resolves the
  actual `git diff` invocation).

Whatever remains after stripping those hints is the scope. If no scope was given at all, ask
the user what to scan (a path, a glob, a directory, "the API", or "the diff") before
proceeding — don't default to scanning the whole repo.

Invoke the `openapi-generator` subagent (Agent tool) with the resolved scope, output path,
title/version, and viewer preference. Relay its summary report — route counts, auth schemes,
upload endpoints, uncertain routes, and output file paths — to the user directly; don't re-run
the discovery yourself in this command.
