# logseq-export

Logseq plugin to export a page together with its **linked references (backlinks only)**, as Markdown.

## Status

Phase 1 MVP implemented: multiple launch entry points → single Markdown download.

Tag + date filters for linked references are implemented via plugin settings (export dialog still planned).
Multi-format export is implemented: Markdown, Markdown ZIP, HTML, plain text.

- **[docs/PLAN.md](./docs/PLAN.md)** — overall plugin design
- **[docs/FILTER_PLAN.md](./docs/FILTER_PLAN.md)** — filter design (tags + date ranges)
- **[docs/FORMATS_PLAN.md](./docs/FORMATS_PLAN.md)** — multi-format outputs design

**Scope lock:** page body + backlinks. No outbound page crawl, no recursion.

## Features

- Launch from the page **•••** menu, toolbar icon, page-title button, command palette, slash command, or an optional keyboard shortcut
- Each launch entry can be turned on or off in plugin settings
- Collects page body via `getPageBlocksTree`
- Collects backlinks via `getPageLinkedReferences`
- Optional parent-path context for each backlink
- Sort linked references newest-first, oldest-first, or alphabetically (plugin setting)
- Wiki-link rewriting: keep / bold / plain
- **Output formats:** Markdown, Markdown ZIP, HTML, plain text (plugin setting)
- **Filter linked references** by include/exclude tags and inclusive date range (plugin settings)
- Plugin settings for format defaults and link style

## Install (development)

1. `npm install`
2. `npm run build`
3. In Logseq: enable **Developer mode** → Plugins → **Load unpacked plugin** → select this repo folder (the one with `package.json`)

## Usage

1. Open a page
2. Run **Export page with linked references** from any enabled entry point:
   - Page **•••** menu
   - Toolbar icon (top plugin bar)
   - Button next to the page title
   - Command palette
   - Slash command: `/Export page with linked references`
   - Keyboard shortcut (off by default; set a chord such as `mod+shift+e` in settings)
3. A file downloads: page body, then a **Linked References** section grouped by source page

Toggle entry points under **Plugins → Export Page + Linked References → How to run export**. Toolbar and page-title buttons hide or show immediately. Turning off the palette, slash command, page menu, or shortcut may require disabling and re-enabling the plugin.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite HMR for plugin development |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm test` | Unit tests (serializer / filename helpers) |

## Non-goals

Outbound/recursive exports, round-trip graph import, remote sync, and full publishing/site generation.
