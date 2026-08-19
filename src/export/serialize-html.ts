import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";
import { describeFilters } from "./filter-refs";
import { pageTitle, rewriteLinks, trimBlankLines, withoutDuplicatedPageProperties } from "./serialize-md";
import type { ExportBundle, LinkStyle, SerializeOptions } from "./types";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return null;
  if (/^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(trimmed)) return trimmed;
  return null;
}

function findClosing(text: string, start: number, delim: string): number {
  let i = start;
  while (i < text.length) {
    if (delim === "*" && text.startsWith("**", i)) {
      i += 2;
      continue;
    }
    if (delim === "_" && text.startsWith("__", i)) {
      i += 2;
      continue;
    }
    if (text.startsWith(delim, i)) return i;
    i++;
  }
  return -1;
}

function consumeDelimited(
  text: string,
  i: number,
  delim: string,
  tag: string,
  keepWiki: boolean,
): { html: string; end: number } | null {
  if (!text.startsWith(delim, i)) return null;
  const innerStart = i + delim.length;
  const close = findClosing(text, innerStart, delim);
  if (close === -1 || close === innerStart) return null;
  const inner = renderInline(text.slice(innerStart, close), keepWiki);
  return { html: `<${tag}>${inner}</${tag}>`, end: close + delim.length };
}

function consumeCodeSpan(text: string, i: number): { html: string; end: number } | null {
  if (text[i] !== "`") return null;
  let ticks = 0;
  while (text[i + ticks] === "`") ticks++;
  const close = "`".repeat(ticks);
  const from = i + ticks;
  const j = text.indexOf(close, from);
  if (j === -1) return null;
  return { html: `<code>${escapeHtml(text.slice(from, j))}</code>`, end: j + ticks };
}

function consumeWikiLink(text: string, i: number): { html: string; end: number } | null {
  if (!text.startsWith("[[", i)) return null;
  const close = text.indexOf("]]", i + 2);
  if (close === -1) return null;
  const label = text.slice(i + 2, close).trim();
  return {
    html: `<a class="wikilink" href="#">${escapeHtml(label)}</a>`,
    end: close + 2,
  };
}

function consumeMdLink(
  text: string,
  i: number,
  keepWiki: boolean,
): { html: string; end: number } | null {
  const image = text[i] === "!";
  const open = image ? i + 1 : i;
  if (text[open] !== "[") return null;

  const labelEnd = text.indexOf("](", open + 1);
  if (labelEnd === -1) return null;
  const urlEnd = text.indexOf(")", labelEnd + 2);
  if (urlEnd === -1) return null;

  const label = text.slice(open + 1, labelEnd);
  const href = safeHref(text.slice(labelEnd + 2, urlEnd));
  const end = urlEnd + 1;
  if (!href) return null;

  if (image) {
    return {
      html: `<img src="${escapeHtml(href)}" alt="${escapeHtml(label)}"/>`,
      end,
    };
  }
  return {
    html: `<a href="${escapeHtml(href)}">${renderInline(label, keepWiki)}</a>`,
    end,
  };
}

function renderInline(text: string, keepWiki: boolean): string {
  let i = 0;
  const parts: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      parts.push(escapeHtml(buf));
      buf = "";
    }
  };

  while (i < text.length) {
    if (keepWiki && text.startsWith("[[", i)) {
      const wiki = consumeWikiLink(text, i);
      if (wiki) {
        flush();
        parts.push(wiki.html);
        i = wiki.end;
        continue;
      }
    }

    if (text[i] === "`") {
      const code = consumeCodeSpan(text, i);
      if (code) {
        flush();
        parts.push(code.html);
        i = code.end;
        continue;
      }
    }

    if (text[i] === "[" || (text[i] === "!" && text[i + 1] === "[")) {
      const link = consumeMdLink(text, i, keepWiki);
      if (link) {
        flush();
        parts.push(link.html);
        i = link.end;
        continue;
      }
    }

    const delimited =
      consumeDelimited(text, i, "**", "strong", keepWiki) ||
      consumeDelimited(text, i, "__", "strong", keepWiki) ||
      consumeDelimited(text, i, "~~", "del", keepWiki) ||
      consumeDelimited(text, i, "==", "mark", keepWiki) ||
      consumeDelimited(text, i, "*", "em", keepWiki);

    if (delimited) {
      flush();
      parts.push(delimited.html);
      i = delimited.end;
      continue;
    }

    if (text[i] === "_" && (i === 0 || !/[A-Za-z0-9]/.test(text[i - 1]))) {
      const italic = consumeDelimited(text, i, "_", "em", keepWiki);
      if (italic) {
        flush();
        parts.push(italic.html);
        i = italic.end;
        continue;
      }
    }

    if (text[i] === "\r") {
      i++;
      continue;
    }
    if (text[i] === "\n") {
      flush();
      parts.push("<br/>");
      i++;
      continue;
    }

    buf += text[i];
    i++;
  }
  flush();
  return parts.join("");
}

/** Inline markdown (bold, italic, code, links) plus wiki links when kept. */
export function formatInlineHtml(content: string, linkStyle: LinkStyle): string {
  const rewritten = rewriteLinks(content, linkStyle);
  return renderInline(rewritten, linkStyle === "keep");
}

function formatFencedCode(content: string): string | null {
  const trimmed = content.trim();
  const match = trimmed.match(/^```([^\n`]*)\n([\s\S]*?)\n?```$/);
  if (!match) return null;
  const lang = match[1].trim();
  const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
  return `<pre><code${langAttr}>${escapeHtml(match[2])}</code></pre>`;
}

/** Block-level markdown: headings, fences, quotes, then inline formatting. */
export function formatBlockHtml(content: string, linkStyle: LinkStyle): string {
  const text = trimBlankLines(content);
  const fenced = formatFencedCode(text);
  if (fenced) return fenced;

  const trimmed = text.trim();
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return "<hr/>";

  const lines = text.split("\n");
  const heading = lines[0].match(/^(#{1,6})\s+(.*)$/);
  if (heading) {
    const level = heading[1].length;
    const title = formatInlineHtml(heading[2], linkStyle);
    const rest = lines.slice(1).join("\n");
    const restHtml = rest.trim() ? formatInlineHtml(trimBlankLines(rest), linkStyle) : "";
    return `<h${level}>${title}</h${level}>${restHtml}`;
  }

  if (lines.some((line) => line.startsWith(">")) && lines.every((line) => !line.trim() || line.startsWith(">"))) {
    const inner = lines.map((line) => line.replace(/^>\s?/, "")).join("\n");
    return `<blockquote>${formatInlineHtml(inner, linkStyle)}</blockquote>`;
  }

  return formatInlineHtml(text, linkStyle);
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

    const inner = content ? formatBlockHtml(content, linkStyle) : "";
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
  if (!properties) return "";
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
  code, pre { background: rgba(0, 0, 0, 0.35); }
  mark { background: #6b5a12; color: inherit; }
}
h1, h2, h3, h4, h5, h6 { font-family: system-ui, sans-serif; font-weight: 650; line-height: 1.25; }
h1 { font-size: 1.75rem; margin-bottom: 0.75rem; }
h2 { font-size: 1.25rem; margin-top: 2rem; border-bottom: 1px solid #ccc4; padding-bottom: 0.25rem; }
h3 { font-size: 1.05rem; margin-top: 1.25rem; }
h4 { font-size: 1rem; }
ul { padding-left: 1.25rem; }
li { margin: 0.25rem 0; }
li > h1, li > h2, li > h3, li > h4, li > h5, li > h6 {
  margin: 0.4em 0 0.15em; border: none; padding: 0; display: inline;
}
li > h1 { font-size: 1.45rem; }
li > h2 { font-size: 1.22rem; }
li > h3 { font-size: 1.08rem; }
code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.88em; background: rgba(0, 0, 0, 0.07); padding: 0.1em 0.35em; border-radius: 3px; }
pre { overflow: auto; padding: 0.75rem 1rem; background: rgba(0, 0, 0, 0.05); border-radius: 6px; }
pre code { background: none; padding: 0; font-size: 0.85em; }
blockquote { margin: 0.25rem 0; padding-left: 0.75rem; border-left: 3px solid #ccc8; }
mark { background: #ffe58a; padding: 0 0.15em; }
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
    blocksToHtmlList(
      withoutDuplicatedPageProperties(
        bundle.body,
        bundle.page.properties as Record<string, unknown> | undefined,
      ),
      options.linkStyle,
    ),
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
