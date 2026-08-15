# logseq-export

Logseq plugin to export a page together with its **linked references (backlinks only)**, as Markdown.

## Status

Phase 1 MVP implemented: command palette + slash command → single Markdown download.

See **[docs/PLAN.md](./docs/PLAN.md)** for the full design (ZIP packaging is Phase 2).

**Scope lock:** page body + backlinks. No outbound page crawl, no recursion.

## Features

- Command palette: **Export page with linked references**
- Slash command: `/Export page with linked references`
- Collects page body via `getPageBlocksTree`
- Collects backlinks via `getPageLinkedReferences`
- Optional parent-path context for each backlink
- Wiki-link rewriting: keep / bold / plain
- Plugin settings for format defaults and link style

## Install (development)

1. `npm install`
2. `npm run build`
3. In Logseq: enable **Developer mode** → Plugins → **Load unpacked plugin** → select this repo folder (the one with `package.json`)

## Usage

1. Open a page
2. Run **Export page with linked references** from the command palette
3. A Markdown file downloads: page body, then a **Linked References** section grouped by source page

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite HMR for plugin development |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm test` | Unit tests (serializer / filename helpers) |

## Non-goals

Outbound/recursive exports, round-trip graph import, remote sync, and full publishing/site generation.
