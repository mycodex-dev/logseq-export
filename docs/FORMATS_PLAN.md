# Feature Plan: Multiple Export Output Formats

## Goal

Support **multiple download formats** for the same export payload (page body + filtered linked references), so users can choose the artifact that fits sharing, publishing, or archival—not only a single Markdown file.

## Current state

| Format | Status |
|--------|--------|
| Single Markdown (`.md`) | **Shipped** — default download |
| Markdown ZIP | Setting enum exists (`defaultFormat: zip`) but falls back to Markdown with a toast |
| HTML / plain text / OPML / JSON | Not implemented |

Today the pipeline ends at:

```
collect → filter → serialize Markdown string → downloadTextFile()
```

Formats should plug in **after** a shared `ExportBundle` is collected and filtered, so tag/date filters and backlinks-only scope apply equally to every output type.

## Principles

1. **One collect, many writers** — `ExportBundle` is the canonical intermediate representation.
2. **Filters are format-agnostic** — tag/date rules run once before packaging.
3. **Lossless preference** — prefer formats that preserve hierarchy; note fidelity limits per format.
4. **Settings + dialog** — `defaultFormat` in settings; per-export override in the shared export dialog (same UI as filters, F2).
5. **No graph mutation** — downloads only.

## Format catalog

### Tier 1 — ship next (high value, fits existing UX)

| ID | Artifact | MIME / ext | Purpose |
|----|----------|------------|---------|
| `markdown` | One `.md` file | `text/markdown` | Default; already shipped |
| `markdown-zip` | `.zip` of Markdown files + `meta.json` | `application/zip` | Multi-file package for re-import / publishing folders |
| `html` | One `.html` file | `text/html` | Share/read in browser without a Markdown viewer |
| `plain` | One `.txt` file | `text/plain` | Clipboard-friendly / stripped markup |

### Tier 2 — later (useful, more design work)

| ID | Artifact | Notes |
|----|----------|-------|
| `json` | `.json` dump of `ExportBundle` (+ meta) | Interop / tooling; stable schema versioning required |
| `opml` | `.opml` outline | Outliners; flatten or map block tree → outline nodes |
| `org` | `.org` | Org-mode users; map bullets / properties conservatively |

### Out of scope (for this feature)

- PDF generation (needs print engine / heavy deps)
- DOCX / Notion / Roam proprietary formats
- Upload to remote services
- Round-trip perfect Logseq graph re-import guarantees
- Changing backlinks-only collection scope

Rename note: settings currently use `zip`; standardize on **`markdown-zip`** in code and map legacy `zip` → `markdown-zip` when reading settings.

## Output shapes

### `markdown` (existing)

Single file:

```markdown
# Page Title
…body…

---
## Linked References
_Filters: …_   # when active
### From [[Source]]
- blocks…
```

### `markdown-zip`

```
{page}-export/
  index.md                 # page body (+ page properties)
  linked-references.md     # filtered backlinks, grouped by source
  meta.json                # provenance (filters, counts, plugin version)
```

Optional later flag: `zipSplitBySourcePage` → `refs/{sanitized-source}.md` instead of one refs file.

### `html`

Self-contained HTML document:

- `<article>` for page body
- `<section id="linked-references">` for backlinks
- Minimal embedded CSS (readable typography; no external CDN required)
- Wiki links as `<a>` with `class="wikilink"` (href optional / `#` stub unless we resolve graph URLs later)
- Preserve list nesting via `<ul>/<li>`

### `plain`

- Headings as underlined or `#`-stripped lines
- Bullets as `- ` indentation (same tree)
- Wiki links rewritten per `linkStyle` (default **plain** for this format unless user overrides)
- No HTML, no YAML front matter

### `json` (tier 2)

```json
{
  "version": 1,
  "exportedAt": "…",
  "rootPage": { "name": "…", "uuid": "…" },
  "filters": { … },
  "body": [ /* block tree */ ],
  "linkedRefs": [ { "page": {…}, "blocks": […] } ]
}
```

Block nodes: `{ uuid, content, properties?, children? }` — strip Logseq-internal noise.

## User experience

### Settings

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `defaultFormat` | enum | `markdown` | `markdown` \| `markdown-zip` \| `html` \| `plain` (+ later formats) |
| `htmlTheme` | enum | `simple` | Reserved: `simple` only in v1 |
| `zipSplitBySourcePage` | boolean | `false` | Tier-1 optional / Tier-1.1 |

### Export dialog (shared with filters)

```
Output format:  (•) Markdown  ( ) Markdown ZIP  ( ) HTML  ( ) Plain text

… filters …
Preview: 128 refs → 14 after filters

[ Cancel ]  [ Export ]
```

### Filename conventions

| Format | Example |
|--------|---------|
| markdown | `Project_Alpha-with-linked-references.md` |
| markdown + filters | `…-filtered.md` |
| markdown-zip | `Project_Alpha-with-linked-references.zip` |
| html | `…-with-linked-references.html` |
| plain | `…-with-linked-references.txt` |

Keep the existing `-filtered` suffix whenever tag/date filters are active, across formats.

### Toasts

- Success: `Exported “X” as HTML with N linked reference block(s).`
- Unknown/unimplemented format: clear error (do not silently fall back without saying so — today’s zip→markdown toast should become a real ZIP writer)

## Architecture

```
src/export/
  collect.ts
  filter-refs.ts
  types.ts
  serialize-md.ts          # keep; also used inside ZIP parts
  serialize-html.ts        # NEW
  serialize-plain.ts       # NEW
  serialize-json.ts        # NEW (tier 2)
  package-zip.ts           # NEW — JSZip assembly
  render.ts                # NEW — format → { filename, blob, mime }
  download.ts              # generalize to downloadBlob()
```

### Renderer interface

```ts
type ExportFormatId = "markdown" | "markdown-zip" | "html" | "plain" | "json" | "opml" | "org";

interface RenderedExport {
  filename: string;
  mime: string;
  blob: Blob;
}

function renderExport(
  bundle: ExportBundle,
  options: SerializeOptions & { format: ExportFormatId },
): Promise<RenderedExport>  // zip is async
```

`index.ts` becomes:

```
bundle = collectExport(…)
rendered = await renderExport(bundle, { format, … })
downloadBlob(rendered)
```

### Dependency

- **JSZip** for `markdown-zip` only (add to `dependencies`)

## Implementation phases

### Phase O0 — Renderer seam
- Introduce `renderExport` + `downloadBlob`
- Route existing Markdown through the seam (behavior unchanged)
- Map setting `zip` → `markdown-zip`

### Phase O1 — Markdown ZIP
- `package-zip.ts` with `index.md`, `linked-references.md`, `meta.json`
- Include filter provenance in `meta.json` and refs file header
- Remove “ZIP not available yet” toast

### Phase O2 — HTML + plain text
- `serialize-html.ts` / `serialize-plain.ts`
- Unit tests: nested lists, filter empty-state, escaping (`<`, `&` in HTML)
- Settings enum extended

### Phase O3 — Dialog format picker
- Wire format radio into the shared export dialog (with filters)
- Preview remains format-agnostic (ref counts only)

### Phase O4 — Tier 2 formats (optional)
- JSON schema v1 + tests
- OPML / Org if demand appears

## Testing plan

Unit / pure:

1. Markdown path still golden-matches current serializer tests  
2. ZIP: file list + `meta.json` fields (use JSZip in Node test)  
3. HTML: escapes content; nested `<ul>`; filter summary present  
4. Plain: no tags; indentation preserved  
5. Filename helper per format + filtered suffix  

Manual:

1. Each format downloads with correct extension  
2. Filtered export shows provenance in Markdown/HTML/plain and in ZIP `meta.json`  
3. Large backlink set ZIP opens without corruption  
4. Setting `markdown-zip` no longer falls back to `.md`

## Risks & edge cases

| Risk | Mitigation |
|------|------------|
| HTML XSS from block content | Escape all text nodes; never inject raw HTML from blocks |
| ZIP size / memory | Build from strings; warn above soft block-count threshold (reuse future size warning) |
| Format sprawl in settings | Tier 1 in enum now; Tier 2 behind later release / advanced section |
| Wiki links in HTML | Stub anchors in v1; no broken external fetches |
| Legacy `zip` setting value | Accept both `zip` and `markdown-zip` when reading |
| Duplicating serialize logic | ZIP parts call `serialize-md` helpers (body-only / refs-only split functions) |

## Refactors needed (small)

Split `serializeExport` into:

- `serializePageMarkdown(bundle, options)` → body document
- `serializeLinkedRefsMarkdown(bundle, options)` → refs section document
- `serializeExport` = join for single-file (preserves current output)

ZIP and tests reuse the split helpers.

## Success criteria

- User can choose at least **Markdown**, **Markdown ZIP**, **HTML**, and **Plain text**
- Same filters/backlinks apply to every format
- ZIP is a real multi-file archive with `meta.json`
- HTML is safe to open locally (escaped)
- Unimplemented formats do not silently pretend to work

## Open decisions

1. **Default stays Markdown?** — recommend **yes**  
2. **ZIP layout:** single `linked-references.md` vs per-source files — recommend **single file first**; optional split setting later  
3. **HTML styling:** embed minimal CSS vs unstyled — recommend **minimal embedded CSS**  
4. **JSON in Tier 1 or 2?** — recommend **Tier 2** until schema is frozen  

## Suggested first slice

1. Renderer seam + `downloadBlob` (O0)  
2. Real **Markdown ZIP** (O1)  
3. **HTML** + **plain** writers (O2)  
4. Dialog format picker when export UI lands (O3)
