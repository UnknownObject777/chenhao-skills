# Reader Library and Export Contract

This reference defines the boundary for reader-owned state and local export in
every generated explainer.

## Reader workspace

The workspace is a modal directory drawer with:

1. favorites at the top;
2. an outline of the current explainer;
3. same-origin opened-history;
4. annotation browsing;
5. PDF, PNG, PPTX, Pages-compatible DOCX, and optional native Pages export.

The drawer must trap focus while open, close on Escape or scrim activation,
return focus to its launcher, and keep its tablist independent from every other
tablist in the document. The annotation tab may highlight scenes with notes,
but it must not hide unannotated content.

## Opt-in and storage boundary

- Do not write persistent state before an explicit reader opt-in.
- Use only the namespaced key `fireworks-open-eli5:library:v1`.
- Store only bounded, validated plain data. Current limits are 100 opened
  documents, 300 favorites, 500 annotations, 1,200 characters per annotation,
  and an approximately 1.5 MiB total soft cap.
- Treat `file://`, unavailable storage, quota errors, and malformed stored data
  as recoverable. Continue with in-memory state and show a truthful notice.
- Accept only HTTP(S) links on the current scheme, host, and port. Revalidate
  every stored URL before displaying or following it.
- Render stored titles and annotations with text APIs. Never insert them as
  HTML.
- Do not put reader state into the source spec, deterministic HTML bytes, spec
  hash, evidence map, or exported presentation.
- Do not sync, upload, or write the state back to the generated artifact.

Opened-history means explainers actually loaded under the same origin after
opt-in. It is not a filesystem index and cannot discover explainers that were
never opened. Clearing site data removes the library. Any script allowed to run
on that origin can read unencrypted localStorage, so a stable dedicated
loopback origin is preferable to a shared site.

## Playback

Global playback and scene-local playback use one queue, cursor, and timer.
Starting one stops the other. Scene-local playback stops at the scene boundary;
global playback may loop. Visibility loss, wheel input, and touch input pause
playback. Active nodes follow the viewport while leaving space for sticky or
mobile controls.

Each trace step advances through enter, hold, and exit phases. Its active node,
real outgoing relationship paths, path labels, arrow markers, current-step
copy, progress indicator, and supporting evidence cards update as one state. A
sink uses its incoming path as the visible arrival. Visited structure remains
teal and the live step remains amber. Reduced-motion preference removes
animation and smooth scrolling but preserves every semantic state.

## Export

### PDF

The PDF control calls the browser print flow. A print stylesheet removes
interactive controls and expands hidden truth panels. Do not claim that a PDF
file exists until the reader saves one or a browser download is observed.

### PNG

PNG export serializes a cloned inline scene SVG with embedded local styles,
draws it to a 1600×900 canvas, checks the PNG signature, and offers the resulting
Blob as a named download. The scene artwork includes a bounded evidence footer
for up to three relevant items, with status, label, concise core basis, and
hostname/local-path/no-locator boundary. It must not fetch fonts, images,
styles, source previews, favicons, or remote metadata.

### PPTX

PPTX export renders every scene through the same PNG path, then creates a
dependency-free OOXML ZIP in the browser. It uses a 16:9 layout, one scene per
slide, and verifies the ZIP signature before offering the file. Automated tests
must inspect at least:

- `[Content_Types].xml`;
- `_rels/.rels`;
- `ppt/presentation.xml`;
- one slide XML and relationship per scene;
- one PNG media part per scene;
- a valid end-of-central-directory record.

### Pages-compatible DOCX

DOCX export renders every scene through the same PNG path and creates a
dependency-free WordprocessingML ZIP with one landscape page per scene. It is
the portable, no-helper option for Pages, Word, and LibreOffice. Automated
tests must inspect at least:

- `[Content_Types].xml` and `_rels/.rels`;
- `word/document.xml` and its relationships;
- core and application properties;
- one PNG media part per scene;
- a valid end-of-central-directory record.

### Native Pages

Modern `.pages` files use Apple's iWork object model. Do not rename a DOCX or
claim that a generic ZIP is a native Pages document. The optional native path
is:

1. build the verified DOCX in the browser;
2. request conversion from the bundled `scripts/serve.mjs` helper;
3. have the installed Pages app open the DOCX and save a native `.pages`;
4. verify the returned ZIP signature and `Index/Document.iwa`;
5. reopen the result in Pages before claiming successful native export.

The helper must bind to `127.0.0.1`, use a non-printed rotating process token,
require an exact same-origin browser request, cap and time out the request
body, and accept only the unencrypted stored OOXML shape produced by this
runtime. It must bound entry count and expanded size, reject unsafe paths and
external XML relationships, require the generator marker and 1600×900 scene
images. Each PNG must also have a valid `IHDR`/`IDAT`/`IEND` sequence and CRCs,
inflate to the exact bounded RGBA scanline length, and use only valid PNG
filters. The helper must pass file paths to `osascript` as arguments rather
than shell text, claim the conversion lock before reading a body, close
candidate Pages documents on every exit path, and remove task-specific
temporary files before releasing the slot. The token is a browser
cross-site-request defense, not local-process authentication; serve only
trusted explainer HTML. The generated explainer must refuse the helper action
outside `127.0.0.1`. No remote conversion fallback is permitted. An explicitly
configured `--pages-output` directory may retain create-only verification
copies after success; it must never overwrite an existing file.

If the browser suppresses programmatic downloads, retain a visible fallback
link with the correct filename, MIME type, size, and export kind. Revoke old
Blob URLs when a newer export replaces them or when the page unloads.

## Browser QA

At desktop and 390px widths, verify:

- no horizontal overflow;
- directory focus trap, Escape close, and focus return;
- independent tab keyboard behavior;
- favorites appear before navigation modes;
- opt-in state survives reload and malformed markup remains inert text;
- global and scene-local playback never overlap;
- active-node viewport following, enter/hold/exit phases, real-path animation,
  and evidence-card synchronization;
- evidence cards expose status, core basis, support scope, and an actionable
  locator or explicit boundary without remote preview requests;
- PNG, PPTX, and DOCX signatures, metadata, and fallback links;
- exported scene artwork visibly contains its bounded evidence footer;
- native Pages helper absence degrades honestly to the DOCX option;
- when tested, the native Pages package reopens in Pages;
- print-only presentation;
- zero executable remote requests and no unexpected console errors.
