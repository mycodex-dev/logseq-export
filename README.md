# logseq-export

Logseq plugin to export a page together with its **linked references (backlinks only)**, as Markdown or a multi-file ZIP.

## Status

Design complete — see **[docs/PLAN.md](./docs/PLAN.md)** for the full plan (scope, UX, architecture, phases).

**Scope lock:** page body + backlinks. No outbound page crawl, no recursion.

## Intended MVP

- Command palette: **Export page with linked references**
- Collect current page body via `getPageBlocksTree`
- Collect backlinks via `getPageLinkedReferences`
- Download a single Markdown file (ZIP packaging planned next)

## Non-goals

Outbound/recursive exports, round-trip graph import, remote sync, and full publishing/site generation.
