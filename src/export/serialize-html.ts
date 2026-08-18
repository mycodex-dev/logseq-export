import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";
import { describeFilters } from "./filter-refs";
import { pageTitle, rewriteLinks } from "./serialize-md";
import type { ExportBundle, LinkStyle, SerializeOptions } from "./types";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

function formatInlineHtml(content: string, linkStyle: LinkStyle): string {
  const rewritten = rewriteLinks(content, linkStyle);
  if (linkStyle !== "keep") {
    return escapeHtml(rewritten);
  }

  // Escape non-link segments; wrap wiki links as stub anchors
  let result = "";
  let last = 0;
  WIKI_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKI_LINK_RE.exec(content)) != null) {
    result += escapeHtml(content.slice(last, match.index));
    const label = match[1].trim();
    result += `<a class="wikilink" href="#">${escapeHtml(label)}</a>`;
    last = match.index + match[0].length;
  }
  result += escapeHtml(content.slice(last));
  return result;
}

function blockContent(block: BlockEntity): string {
  return typeof block.content === "string" ? block.content : "";
}

function blocksToHtmlList(
  blocks: BlockEntity[],
  linkStyle: LinkStyle,
): string {
  if (blocks.length === 0) return "";

  const items: string[] = [];
  for (const block of blocks) {
    const content = blockContent(block).trim();
    const children = (block.children as BlockEntity[] | undefined) ?? [];
    if (!content && children.length === 0) continue;

    const inner = content ? formatInlineHtml(blockContent(block), linkStyle) : "";
    const childHtml = blocksToHtmlList(children, linkStyle);
    items.push(`<li>${inner}${childHtml}</li>`);
  }

  if (items.length === 0) return "";
  return `<ul>${items.join("")}</ul>`;
}

function propertiesToHtml(
  properties: Record<string, unknown> | undefined,
  linkStyle: LinkStyle,
): string {
  if (!properties || Object.keys(properties).length === 0) return "";
  const rows: string[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (key === "id" || key === "title") continue;
    const rendered =
      value == null
        ? ""
        : Array.isArray(value)
          ? value.map(String).join(", ")
          : String(value);
    rows.push(
      `<div class="prop"><span class="prop-key">${escapeHtml(key)}</span>: ${formatInlineHtml(rendered, linkStyle)}</div>`,
    );
  }
  return rows.length ? `<div class="properties">${rows.join("")}</div>` : "";
}

const EMBEDDED_CSS = `
:root { color-scheme: light dark; }
body { font-family: Georgia, "Times New Roman", serif; line-height: 1.5; max-width: 44rem; margin: 2rem auto; padding: 0 1.25rem; color: #1a1a1a; background: #faf9f7; }
@media (prefers-color-scheme: dark) {
  body { color: #e8e6e3; background: #1c1b1a; }
}
h1, h2, h3 { font-family: system-ui, sans-serif; font-weight: 650; line-height: 1.25; }
h1 { font-size: 1.75rem; margin-bottom: 0.75rem; }
h2 { font-size: 1.25rem; margin-top: 2rem; border-bottom: 1px solid #ccc4; padding-bottom: 0.25rem; }
h3 { font-size: 1.05rem; margin-top: 1.25rem; }
ul { padding-left: 1.25rem; }
li { margin: 0.25rem 0; }
.properties { font-family: ui-monospace, monospace; font-size: 0.85rem; margin-bottom: 1rem; opacity: 0.85; }
.prop-key { font-weight: 600; }
.filters, .empty { font-style: italic; opacity: 0.8; }
a.wikilink { color: inherit; text-decoration: underline dotted; }
hr { border: none; border-top: 1px solid #ccc6; margin: 2rem 0; }
`.trim();

export function serializeHtml(bundle: ExportBundle, options: SerializeOptions): string {
  const title = pageTitle(bundle.page);
  const filterSummary = bundle.appliedFilters
    ? describeFilters(bundle.appliedFilters)
    : null;

  const bodyHtml = [
    propertiesToHtml(
      bundle.page.properties as Record<string, unknown> | undefined,
      options.linkStyle,
    ),
    blocksToHtmlList(bundle.body, options.linkStyle),
  ]
    .filter(Boolean)
    .join("\n");

  let refsInner = "";
  if (filterSummary) {
    refsInner += `<p class="filters">Filters: ${escapeHtml(filterSummary)}</p>\n`;
  }
  if (bundle.linkedRefs.length === 0) {
    const empty = filterSummary
      ? "No linked references matched the current filters."
      : "No linked references.";
    refsInner += `<p class="empty">${escapeHtml(empty)}</p>\n`;
  } else {
    for (const group of bundle.linkedRefs) {
      const from = pageTitle(group.page);
      refsInner += `<h3>From ${formatInlineHtml(`[[${from}]]`, options.linkStyle)}</h3>\n`;
      refsInner += blocksToHtmlList(group.blocks, options.linkStyle) || `<p class="empty">No blocks.</p>\n`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>${EMBEDDED_CSS}</style>
</head>
<body>
<article>
<h1>${escapeHtml(title)}</h1>
${bodyHtml}
</article>
<hr/>
<section id="linked-references">
<h2>${escapeHtml(options.headingForRefs)}</h2>
${refsInner}
</section>
</body>
</html>
`;
}
