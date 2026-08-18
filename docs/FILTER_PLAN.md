# Feature Plan: Filter Linked References by Tag & Date Range

## Goal

Let users **narrow which backlinks are included** in an export by:

1. **Tags** — keep or exclude linked-reference blocks that carry given tags
2. **Date ranges** — keep linked references that fall within a from/to window

Page body export stays unchanged. Filters apply only to the **Linked References** section (backlinks), consistent with the locked backlinks-only scope.

## Why

Large pages (projects, people, tags-as-pages) often have hundreds of backlinks across journals and notes. Exporting everything is noisy. Users typically want slices such as:

- Refs tagged `#decision` or `#meeting` from the last quarter
- Journal mentions between two dates
- Everything except `#archive` / `#spam`

## Current hook points

Today the pipeline is:

```
collectExport() → serializeExport() → downloadTextFile()
```

Linked refs are gathered in `src/export/collect.ts` from `getPageLinkedReferences`, optionally parent-enriched, then sorted by page name. **Filtering should run after fetch / before (or after) parent-path enrichment**, as a pure step:

```
getPageLinkedReferences
  → filterLinkedRefs(tags, dates)   // NEW
  → optional withParentPath
  → serialize
```

Prefer filtering **before** parent-path walks so we do not spend API calls enriching blocks that will be dropped.

## Filter semantics

### Tags

| Rule | Behavior |
|------|----------|
| **Include tags** (allowlist) | Keep a ref block if it matches **any** include tag (OR). If the list is empty, do not restrict by include. |
| **Exclude tags** (blocklist) | Drop a ref block if it matches **any** exclude tag. Applied after include. |
| **Match mode** | `any` (default) vs `all` for include tags only |

**Where a tag counts as present** (v1 recommendation):

| Location | In v1? | Notes |
|----------|--------|-------|
| Block content `#tag` or `[[tag]]` | Yes | Primary signal |
| Block `properties.tags` / other props | Yes | Common Logseq pattern |
| Ancestor content when parent path is on | No (v1) | Filter the **matched** backlink block only; ancestors are context |
| Source **page** tags / page name | Optional setting | Default **off**; useful for “only refs from pages tagged X” |

Tag comparison: case-insensitive; strip leading `#`; treat `[[Tag]]` and `#Tag` as the same tag name.

**Examples**

| Input | Result |
|-------|--------|
| Include: `decision` | Only blocks mentioning `#decision` / `[[decision]]` |
| Include: `meeting, call` · mode `any` | Blocks with either tag |
| Include: `meeting, call` · mode `all` | Blocks with both tags |
| Exclude: `archive` | Drop archived refs even if they matched include |
| Include empty + Exclude `spam` | All refs except spam |

### Date ranges

Keep a linked-reference block when its **effective date** is within `[from, to]` (inclusive). Empty bound = open-ended.

**Effective date resolution** (first match wins):

1. **Journal page date** — if the source page is a journal, use that journal day  
2. **Block `created` / `updated` timestamp** — from `BlockEntity` when available (ms epoch)  
3. **Scheduled / deadline** in block content or properties (optional v1.1)  
4. If no date can be resolved → **include by default** when a range is set, unless setting `dropUndatedRefs` is enabled

**Timezone:** interpret journal dates and user-entered `YYYY-MM-DD` as **local calendar dates** (no time-of-day in v1). Block timestamps truncate to local date for comparison.

**Examples**

| From | To | Keeps |
|------|----|-------|
| `2026-01-01` | `2026-03-31` | Q1 2026 journals / dated blocks |
| `2026-08-01` | _(empty)_ | From Aug 1 onward |
| _(empty)_ | `2025-12-31` | Everything through end of 2025 |

Tags and dates **combine with AND**: a block must pass the tag rules **and** the date window.

## User experience

### Export dialog (preferred for this feature)

Settings alone are a poor fit for per-export dates/tags. Introduce a small `provideUI` panel when the command runs:

```
Export: Project Alpha
────────────────────────────────────────
☑ Page body
☑ Linked references (backlinks)
☐ Full parent path for each ref block

Filter linked references
  Tags include:  [ decision, meeting     ]
  Tags exclude:  [ archive               ]
  Match include: (•) any  ( ) all

  From date:     [ 2026-01-01 ]
  To date:       [ 2026-03-31 ]
  ☐ Drop refs with no resolvable date

Link style:      (•) keep  ( ) bold  ( ) plain

Preview: 128 refs → 14 after filters

[ Cancel ]  [ Export ]
```

Live preview count (optional but high value): run filter on the in-memory linked-ref list and show `N → M`.

### Settings (defaults only)

Persist **defaults** for the dialog, not one-shot values only:

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `filterIncludeTags` | string | `""` | Comma-separated include tags |
| `filterExcludeTags` | string | `""` | Comma-separated exclude tags |
| `filterTagMatch` | enum `any` \| `all` | `any` | Include-tag logic |
| `filterDateFrom` | string | `""` | `YYYY-MM-DD` or empty |
| `filterDateTo` | string | `""` | `YYYY-MM-DD` or empty |
| `dropUndatedRefs` | boolean | `false` | When a date filter is active |
| `filterSourcePageTags` | boolean | `false` | Also match tags on the source page |

### Empty result behavior

If filters remove every linked ref:

- Still export the page body
- Linked References section shows `_No linked references matched the current filters._`
- Toast: `Exported “X” with 0 linked reference block(s) (filtered).`

### Filename / provenance

- Optional filename suffix when filters active: `Project_Alpha-with-linked-references-filtered.md`
- In Markdown, under the refs heading, emit a short HTML comment or italic line describing applied filters, e.g.  
  `_Filters: tags include decision; from 2026-01-01 to 2026-03-31_`

## Architecture

```
src/
  export/
    collect.ts           # fetch + parent path (existing)
    filter-refs.ts       # NEW — pure tag + date filtering
    parse-tags.ts        # NEW — extract tags from content/properties
    dates.ts             # NEW — parse YYYY-MM-DD, journal day, block time
    serialize-md.ts      # mention active filters in output
    types.ts             # FilterOptions on ExportBundle / settings
  ui/
    export-dialog.ts     # NEW — provideUI for per-export filters
```

### Types (sketch)

```ts
export interface FilterOptions {
  includeTags: string[];      // normalized, lowercased, no '#'
  excludeTags: string[];
  tagMatch: "any" | "all";
  dateFrom: string | null;    // YYYY-MM-DD
  dateTo: string | null;
  dropUndatedRefs: boolean;
  matchSourcePageTags: boolean;
}

export interface ExportBundle {
  page: PageEntity;
  body: BlockEntity[];
  linkedRefs: LinkedRefGroup[];
  appliedFilters?: FilterOptions; // for serialize provenance
}
```

### Core API (pure, unit-tested)

```ts
function filterLinkedRefs(
  groups: LinkedRefGroup[],
  filters: FilterOptions,
): LinkedRefGroup[]

function blockHasTag(block: BlockEntity, tag: string): boolean
function extractTags(block: BlockEntity): Set<string>
function effectiveDate(page: PageEntity, block: BlockEntity): string | null  // YYYY-MM-DD
function inDateRange(day: string | null, from: string | null, to: string | null, dropUndated: boolean): boolean
function parseTagList(input: string): string[]
```

Drop empty groups after block filtering. Keep sort order stable (page name).

### Journal date parsing

Reuse Logseq journal conventions already present on `PageEntity` when possible (`journalDay` number like `20260815`, or `journal?` + page name). Fallback: parse common journal title formats only if needed; prefer `journalDay` when set.

## Implementation phases

### Phase F0 — Pure filter module + tests
- `parse-tags`, `dates`, `filter-refs`
- Fixtures: blocks with `#tag` / `[[tag]]` / properties; journal vs non-journal pages
- No UI yet; wire filters from plugin settings only

### Phase F1 — Settings-driven filtering in export path
- Read filter fields from settings in `readExportSettings`
- Apply in `collectExport` (or immediately after) before parent-path enrichment
- Serializer notes applied filters; toast mentions filtered count

### Phase F2 — Export dialog
- `provideUI` panel with tag fields + date inputs + preview counts
- Prefill from settings; Export uses dialog values for that run
- Cancel leaves graph untouched

### Phase F3 — Polish
- Filename suffix when filtered
- Validate date order (`from <= to`) with inline error
- Debounced preview for large backlink sets
- Docs / README examples

## Testing plan

Unit tests (no Logseq runtime):

1. Tag extract: `#Foo`, `[[Foo]]`, `foo:: bar` style tags in properties  
2. Include any / all / exclude precedence  
3. Case and `#` normalization  
4. Journal `journalDay` inside / outside range  
5. Open-ended from/to  
6. Undated + `dropUndatedRefs` on/off  
7. Empty groups removed; page body unaffected (integration-level assert in collect tests with mocks)

Manual:

1. Page with mixed journal + tagged notes → filter to one tag  
2. Date window that excludes older journals  
3. Include + exclude together  
4. Filters that match nothing → clear empty-state copy  
5. Dialog cancel does not download  

## Risks & edge cases

| Risk | Mitigation |
|------|------------|
| Tags in parent path but not on matched block | Document v1 as matched-block-only; optional later “match ancestors” |
| Hierarchical tags (`#project/alpha`) | Exact match on full tag string in v1; no prefix inheritance unless requested later |
| Non-journal pages with no timestamps | `dropUndatedRefs` or include-by-default |
| Locale-specific journal titles | Prefer `journalDay` over title parsing |
| Very large backlink lists + preview | Filter in memory first; defer parent enrichment; debounce preview |
| Tag typos in settings | Show preview count so users notice zero matches before export |

## Non-goals (this feature)

- Filtering the **page body** itself  
- Full-text keyword search (separate from tags)  
- Query / Datalog expressions in the UI  
- Changing the locked backlinks-only export scope  
- Relative dates (`last 7 days`) in v1 — can add as presets later  

## Open decisions

1. **Dialog-first vs settings-first** — recommend **F1 settings then F2 dialog** so value ships without UI complexity  
2. **Source page tags** — default off; enable via `filterSourcePageTags`  
3. **Undated refs** — default **keep** when a date range is set (`dropUndatedRefs: false`)  
4. **Relative date presets** — defer to F3+ (`Last 30 days`, `This year`)  

## Success criteria

- User can export backlinks limited by tags and/or an inclusive date range  
- Filters never alter the page body  
- Pure filter logic is covered by unit tests  
- Applied filters are visible in the exported Markdown  
- Empty filter match is obvious in UI + file  

## Suggested first slice

1. Add `FilterOptions` + `filter-refs.ts` with unit tests — **done**
2. Plumb settings → `collectExport` → serialize provenance line — **done**
3. Only then build the export dialog (F2) — next
