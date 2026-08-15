# Plan: Logseq Page + Linked References Export Plugin

## Goal

Build a Logseq plugin (`logseq-export`) that exports the **current page** together with its **linked references** (and optionally related pages) into a portable artifact—primarily Markdown, with optional multi-file ZIP.

## Problem

Logseq already shows Linked References in the UI, but there is no first-class way to:

1. Snapshot a page **plus** the blocks that reference it
2. Package that subgraph for sharing, backup, publishing, or archival
3. Control depth, filters, and output shape without manual copy/paste

Existing tools are adjacent but incomplete for this use case:

| Tool | What it does | Gap |
|------|----------------|-----|
| Built-in export | Whole-graph or single-page-ish flows | Not “page + linked refs” as one package |
| `logseq-block-extractor` | Extracts linked-ref blocks for a tag/page to one `.md` | Focused on refs extraction, not full page packaging / multi-format |
| `@logseq/cli` export | DB-graph Markdown/EDN dump | Offline/CLI; not an in-app page-scoped UX |

## Scope definition (important)

In Logseq, **Linked References** means **backlinks**: blocks on other pages that mention `[[Current Page]]` (or `#Current Page`).

This plugin will treat that as the core meaning, and layer optional “related content” modes:

| Mode | Includes | Default |
|------|----------|---------|
| **A. Page body** | Blocks on the target page (`getPageBlocksTree`) | Always on |
| **B. Linked references** | Backlink page/block pairs (`getPageLinkedReferences`) | Always on (MVP) |
| **C. Outbound pages** | Pages linked *from* the target page body | Opt-in |
| **D. Recursive subgraph** | Walk outbound and/or inbound links to depth *N* | Opt-in (v2) |

**MVP = A + B.** Modes C/D are designed in but not required for v1.

## User experience

### Entry points

1. **Command palette**: `Export page with linked references`
2. **Page menu / toolbar button** (if feasible via `App.registerUIItem` / page header slot)
3. **Slash command** (optional): `/export page + refs`
4. **Keyboard shortcut** (settings-configurable)

### Export dialog (settings UI or `provideUI` panel)

When invoked on the current page:

```
Export: Project Alpha
─────────────────────────────────
☑ Page body
☑ Linked references (backlinks)
☐ Full parent path for each ref block
☐ Include outbound linked pages
☐ Recurse depth: [1]

Output format:  ( ) Single Markdown  (•) Markdown ZIP  ( ) HTML (later)

Link handling:  (•) Keep [[wiki]]  ( ) Bold  ( ) Plain text

[ Cancel ]  [ Export ]
```

On success: trigger a browser download + `logseq.UI.showMsg`.

### Output shapes

#### 1) Single Markdown (default for small exports)

```markdown
# Project Alpha

<!-- page properties -->
type:: project
status:: active

- page body blocks…
  - nested…

---

## Linked References

### From [[Journal/2026-08-15]]

- parent context
  - **matching block that links here**
    - children…

### From [[Meeting Notes]]

- …
```

#### 2) Markdown ZIP (better for re-import / publishing)

```
project-alpha-export/
  index.md                 # target page
  linked-references.md     # all backlinks, grouped by source page
  pages/
    Journal_2026-08-15.md  # optional: only if outbound/recurse enabled
  meta.json                # export provenance
```

`meta.json` example:

```json
{
  "plugin": "logseq-export",
  "version": "0.1.0",
  "exportedAt": "2026-08-15T12:00:00.000Z",
  "rootPage": "Project Alpha",
  "modes": ["page-body", "linked-references"],
  "blockCount": 42,
  "refGroupCount": 7
}
```

## Architecture

```
src/
  index.ts                 # logseq.ready, register commands/UI
  settings.ts              # SettingSchemaDesc (defaults + shortcut)
  export/
    collect.ts             # gather page tree + linked refs (+ optional outbound)
    serialize-md.ts        # block tree → Markdown
    package.ts             # single file vs ZIP (JSZip)
    download.ts            # Blob + anchor download helper
    types.ts               # ExportOptions, ExportBundle
  ui/
    export-dialog.ts       # provideUI panel or settings-driven confirm
```

### Data collection (core)

```ts
async function collectExport(root: PageIdentity, opts: ExportOptions): Promise<ExportBundle> {
  const page = await logseq.Editor.getPage(root)
  const body = await logseq.Editor.getPageBlocksTree(root)
  const linkedRefs =
    await logseq.Editor.getPageLinkedReferences(root) // Array<[PageEntity, BlockEntity[]]> | null

  let outboundPages: PageEntity[] = []
  if (opts.includeOutbound) {
    outboundPages = await resolveOutboundPages(body)
  }

  // v2: recurse with visited-set + depth limit
  return { page, body, linkedRefs: linkedRefs ?? [], outboundPages }
}
```

**Primary APIs:**

- `logseq.Editor.getCurrentPage()`
- `logseq.Editor.getPageBlocksTree(page)`
- `logseq.Editor.getPageLinkedReferences(page)`
- `logseq.App.registerCommandPalette(...)`
- `logseq.useSettingsSchema(...)`
- `logseq.UI.showMsg(...)`

### Serialization rules

1. Preserve block hierarchy with indentation (`-` lists).
2. Preserve block properties as Logseq `key:: value` lines when present.
3. Optionally include ancestor path for each linked-ref hit (matches extractor UX).
4. Sanitize filenames for ZIP (`/` → `_`, strip unsafe chars).
5. Never mutate the graph—read-only export.

### Link rewriting (setting)

| Mode | `[[Page]]` becomes |
|------|--------------------|
| `keep` | `[[Page]]` |
| `bold` | `**Page**` |
| `plain` | `Page` |

## Settings schema (v1)

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `defaultFormat` | enum `markdown` \| `zip` | `markdown` | Output package |
| `includeParentPath` | boolean | `true` | Context above matched ref blocks |
| `includeOutbound` | boolean | `false` | Mode C |
| `recurseDepth` | number | `0` | Mode D (`0` = off) |
| `linkStyle` | enum `keep` \| `bold` \| `plain` | `keep` | Link rewriting |
| `headingForRefs` | string | `Linked References` | Section title in single-file MD |
| `shortcut` | string | unset / suggested | Command keybinding |

## Tech stack

- **TypeScript + Vite** (Logseq plugin template pattern)
- **`@logseq/libs`** for the plugin bridge
- **JSZip** for multi-file packages
- Minimal UI: Logseq `provideUI` / settings first; avoid a heavy SPA unless the dialog needs it
- Package for Marketplace: `dist/` + `package.json` `logseq.id` / `logseq.title` / icon

Suggested `package.json` identity:

```json
{
  "name": "logseq-export",
  "main": "dist/index.html",
  "logseq": {
    "id": "logseq-export",
    "title": "Export Page + Linked References",
    "icon": "./icon.png"
  }
}
```

## Implementation phases

### Phase 0 — Scaffold
- Vite + TS plugin skeleton
- `logseq.ready` hello path
- Palette command stub that shows current page name

### Phase 1 — MVP export (A + B)
- Collect page body + `getPageLinkedReferences`
- Serialize to single Markdown
- Download + success toast
- Basic settings: link style, include parent path

### Phase 2 — Packaging & UX
- ZIP multi-file output + `meta.json`
- Lightweight export dialog (format / toggles)
- Page toolbar / slash command entry points
- Empty-state handling (no refs, journals, namespaces)

### Phase 3 — Related pages (C/D)
- Outbound page resolution from block content (`[[...]]` parse)
- Recursion with depth + visited set + cycle safety
- Progress UI for large subgraphs
- Soft caps / warnings above N blocks or M pages

### Phase 4 — Polish & release
- README, screenshots, Marketplace assets
- Manual test checklist (file graphs + DB graphs if supported by libs version)
- Semantic-release / zip artifact CI (optional)

## Edge cases & risks

| Risk | Mitigation |
|------|------------|
| Very large linked-ref sets (popular tags) | Warn + confirm; optional keyword filter (later); stream into ZIP |
| Namespace pages (`a/b/c`) | Sanitize paths; keep display names in Markdown headings |
| Journals as sources | Group by journal title; stable sort (date desc or name) |
| Blocks without page context | Skip or attach under `Unknown` |
| Embeds / advanced blocks | Export raw content first; perfect fidelity is non-goal for v1 |
| DB graph vs file graph API differences | Pin `@logseq/libs` version; test both; feature-detect where needed |
| Circular links in recurse mode | `Set` of visited page UUIDs/names |
| Assets (images) | v1: keep relative/`../assets` references as-is; v2: optional asset copy into ZIP |

## Non-goals (v1)

- Round-trip perfect re-import as a Logseq graph
- Full HTML/PDF publishing site generator
- Editing or deleting source content
- Sync/upload to remote services
- Query-based exports beyond the current page’s refs

## Testing plan

Manual (Logseq desktop, developer mode → Load unpacked plugin):

1. Page with no linked refs → exports body only, empty refs section or omitted section per setting
2. Page with refs from journal + normal pages → grouped correctly
3. Nested ref blocks with parent path on/off
4. Namespace page names in ZIP filenames
5. Link style keep/bold/plain
6. Large page smoke test (performance acceptable for hundreds of blocks)
7. Command palette + shortcut invocation

Automated (lightweight):

- Unit tests for Markdown serializer and filename sanitizer (pure functions, no Logseq runtime)

## Success criteria

- From any page, user can export **page body + linked references** in ≤2 clicks after install
- Output is readable Markdown that preserves hierarchy
- No graph mutations
- Settings cover format and link handling without code changes

## Open decisions (resolve before/during Phase 1)

1. **Single-file vs ZIP as default** — recommend single Markdown for v1 simplicity; ZIP as explicit option
2. **Whether “linked references” should also imply outbound pages** — recommend **no** for MVP; keep Mode C optional to match Logseq vocabulary
3. **UI**: settings-only confirm vs modal dialog — recommend small `provideUI` dialog once toggles exceed ~3
4. **Asset bundling** — defer to v2 unless user demand is immediate

## Suggested first implementation slice

After this plan is accepted:

1. Scaffold the plugin
2. Implement `collect.ts` + `serialize-md.ts` + download
3. Register palette command on current page
4. Ship a usable MVP before ZIP/dialog/recursion
