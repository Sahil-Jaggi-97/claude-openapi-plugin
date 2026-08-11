# File-upload detection and OpenAPI representation

Any route that accepts an uploaded file (single or multiple) must be documented with a
`multipart/form-data` request body — never as a plain JSON body, and never silently dropped
from the spec because the body "isn't a normal object."

## Representing uploads in OpenAPI

**Single file, field name `file`:**
```yaml
requestBody:
  required: true
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          file:
            type: string
            format: binary
        required: [file]
```

**Multiple files under one field name (array upload), field name `files`:**
```yaml
requestBody:
  required: true
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          files:
            type: array
            items:
              type: string
              format: binary
        required: [files]
```

**Multiple distinct named file fields** (e.g. `avatar` + `resume` on the same request) plus
regular form fields alongside files — combine them in one schema, non-file fields get their
normal inferred type (string/number/etc., or `{}` if genuinely unknown):
```yaml
requestBody:
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          avatar: { type: string, format: binary }
          resume: { type: string, format: binary }
          displayName: { type: string }
```

Always use the **actual field name(s)** found in source (the string literal passed to
`multer().single('...')`, the FastAPI parameter name, etc.) — never a placeholder like `file`
unless that's genuinely the name used.

## Detection per stack

**Node.js — multer** (the dominant Express upload middleware)
- `const upload = multer({ ... })` then `upload.single('fieldName')`,
  `upload.array('fieldName', maxCount)`, or `upload.fields([{ name: 'a' }, { name: 'b',
  maxCount: n }])` used as route middleware. `.single` → one file field; `.array` → array under
  that one field name; `.fields` → multiple distinct named fields (each single, unless its own
  `maxCount > 1`).
- Handler body reads `req.file` (single) or `req.files` (array/fields).
- Less common alternatives: `formidable`, `busboy`, `express-fileupload` (`req.files.<name>`)
  — same representation, field names come from the form/parse call.

**Next.js App Router**
- `const formData = await request.formData()` followed by `formData.get('fieldName')` /
  `formData.getAll('fieldName')` where the retrieved value is used as/checked to be a `File`
  (e.g. `instanceof File`, or a `.arrayBuffer()`/`.stream()` call on it). `getAll` on a
  file field → array-of-binary; `get` → single binary.

**Python — FastAPI**
- A handler parameter typed `UploadFile` (single) or `List[UploadFile]` (multiple) via `File(...)`,
  e.g. `file: UploadFile = File(...)` or `files: list[UploadFile] = File(...)`. The parameter
  name is the field name.

**Python — Flask / Django**
- Flask: `request.files['fieldName']` or `request.files.getlist('fieldName')` (multiple) inside
  a route whose form was `enctype="multipart/form-data"` or that's clearly an API upload
  endpoint.
- Django: `request.FILES['fieldName']` / `request.FILES.getlist('fieldName')`, or a
  `FileField`/`ImageField` on the DRF serializer used by the view.

**Java — Spring**
- A controller parameter typed `MultipartFile` (single) or `MultipartFile[]` /
  `List<MultipartFile>` (multiple), typically annotated `@RequestParam("fieldName")` or
  `@RequestPart("fieldName")`.

**Ruby on Rails**
- A strong-parameter permitting a field that's used with `ActionDispatch::Http::UploadedFile`
  methods (`.tempfile`, `.original_filename`) in the controller, or an Active Storage attach
  call (`params[:fieldName]` passed to `record.fieldName.attach(...)`).

**PHP — Laravel**
- `$request->file('fieldName')` (single) or `$request->file('fieldName')` returning an array
  when the form field is named `fieldName[]` (multiple); also `$request->hasFile(...)` as a
  weaker corroborating signal.

**C# — ASP.NET Core**
- A controller/minimal-API parameter typed `IFormFile` (single) or `IFormFileCollection`/
  `List<IFormFile>` (multiple), commonly with `[FromForm]`.

**Go**
- net/http: `r.FormFile("fieldName")` (requires a prior `r.ParseMultipartForm(...)` call) —
  single file, field name from the call's argument. Multiple files under one field name:
  `r.MultipartForm.File["fieldName"]` (a slice). Framework wrappers (gin's
  `c.FormFile("fieldName")` / `c.MultipartForm()`, echo's `c.FormFile("fieldName")`) follow the
  same field-name-as-argument convention.

## When detection is ambiguous

If a route clearly parses `multipart/form-data` (content-type check, or use of a
multipart-parsing library) but the specific field name(s) can't be pinned down from static
reading (e.g. built dynamically from a variable), still mark the request body as
`multipart/form-data` with a generic `type: object` schema and note in the operation
description that field names couldn't be statically determined — don't downgrade it back to a
plain JSON body just because the exact shape is fuzzy.
