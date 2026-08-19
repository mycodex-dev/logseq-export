import type { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin.user";
import { describeFilters } from "./filter-refs";
import type { ExportBundle, ExportFormat, FilterOptions, LinkStyle, SerializeOptions } from "./types";
import { filtersAreActive } from "./types";

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

export function rewriteLinks(content: string, style: LinkStyle): string {
  if (style === "keep") return content;
  return content.replace(WIKI_LINK_RE, (_match, name: string) => {
    const trimmed = name.trim();
    if (style === "bold") return `**${trimmed}**`;
    return trimmed;
  });
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120) || "export";
}

export function pageTitle(page: PageEntity): string {
  return page.originalName || page.name || "Untitled";
}

const PROPERTY_LINE_RE = /^[A-Za-z0-9][\w-]*\s*::/;

function isHiddenPagePropKey(key: string): boolean {
  return key === "id" || key === "title";
}

export function hasRenderablePageProperties(
  properties: Record<string, unknown> | undefined,
): boolean {
  if (!properties) return false;
  return Object.entries(properties).some(
    ([key, value]) => !isHiddenPagePropKey(key) && value != null,
  );
}

export function isPropertiesOnlyContent(content: string): boolean {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 && lines.every((line) => PROPERTY_LINE_RE.test(line));
}

function stripPropertyLines(content: string): string {
  return content
    .split("\n")
    .filter((line) => !PROPERTY_LINE_RE.test(line.trim()))
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/**
 * Logseq stores page properties both on `page.properties` and as the first
 * body block (`key:: value` lines). Drop that duplicate when properties
 * are already rendered from the page object.
 */
export function withoutDuplicatedPageProperties(
  blocks: BlockEntity[],
  pageProperties: Record<string, unknown> | undefined,
): BlockEntity[] {
  if (!hasRenderablePageProperties(pageProperties) || blocks.length === 0) {
    return blocks;
  }

  const [first, ...rest] = blocks;
  const content = typeof first.content === "string" ? first.content : "";
  const children = (first.children as BlockEntity[] | undefined) ?? [];

  if (isPropertiesOnlyContent(content)) {
    return [...children, ...rest];
  }

  const stripped = stripPropertyLines(content);
  if (stripped === content) return blocks;
  if (!stripped.trim()) return [...children, ...rest];
  return [{ ...first, content: stripped }, ...rest];
}

function pageProperties(
  page: PageEntity,
): Record<string, unknown> | undefined {
  return page.properties as Record<string, unknown> | undefined;
}

function propertiesToMarkdown(
  properties: Record<string, unknown> | undefined,
  linkStyle: LinkStyle,
): string[] {
  if (!hasRenderablePageProperties(properties)) return [];

  const lines: string[] = [];
  for (const [key, value] of Object.entries(properties!)) {
    if (isHiddenPagePropKey(key)) continue;
    const rendered = formatPropertyValue(value, linkStyle);
    if (rendered === null) continue;
    lines.push(`${key}:: ${rendered}`);
  }
  return lines;
}

function formatPropertyValue(value: unknown, linkStyle: LinkStyle): string | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return rewriteLinks(String(value), linkStyle);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => formatPropertyValue(item, linkStyle))
      .filter((item): item is string => item != null)
      .join(", ");
  }
  return rewriteLinks(JSON.stringify(value), linkStyle);
}

function blockContent(block: BlockEntity): string {
  return typeof block.content === "string" ? block.content : "";
}

function shouldSkipBlock(block: BlockEntity): boolean {
  return !blockContent(block).trim();
}

/** Bullet plus indented continuation lines so multi-line blocks stay in the list. */
export function listItemLines(content: string, indent: string): string[] {
  const text = content.trimEnd();
  if (!text.trim()) return [`${indent}-`];

  const [first, ...rest] = text.split(/\r?\n/);
  const lines = [first ? `${indent}- ${first}` : `${indent}-`];
  const continuation = `${indent}  `;
  for (const line of rest) {
    lines.push(`${continuation}${line}`);
  }
  return lines;
}

export function blocksToMarkdown(
  blocks: BlockEntity[],
  linkStyle: LinkStyle,
  depth = 0,
): string[] {
  const lines: string[] = [];

  for (const block of blocks) {
    if (shouldSkipBlock(block) && (!block.children || block.children.length === 0)) {
      continue;
    }

    const indent = "  ".repeat(depth);
    const content = rewriteLinks(blockContent(block), linkStyle);
    lines.push(...listItemLines(content, indent));

    const children = (block.children as BlockEntity[] | undefined) ?? [];
    if (children.length > 0) {
      lines.push(...blocksToMarkdown(children, linkStyle, depth + 1));
    }
  }

  return lines;
}

function finishMarkdown(parts: string[]): string {
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Page title, properties, and body blocks only. */
export function serializePageMarkdown(bundle: ExportBundle, options: SerializeOptions): string {
  const title = pageTitle(bundle.page);
  const parts: string[] = [`# ${title}`, ""];

  const props = propertiesToMarkdown(pageProperties(bundle.page), options.linkStyle);
  if (props.length > 0) {
    parts.push(...props, "");
  }

  const bodyLines = blocksToMarkdown(
    withoutDuplicatedPageProperties(bundle.body, pageProperties(bundle.page)),
    options.linkStyle,
  );
  if (bodyLines.length > 0) {
    parts.push(...bodyLines, "");
  }

  return finishMarkdown(parts);
}

/** Linked references section (heading + filter note + groups). */
export function serializeLinkedRefsMarkdown(
  bundle: ExportBundle,
  options: SerializeOptions,
): string {
  const parts: string[] = [`# ${options.headingForRefs}`, ""];

  const filterSummary = bundle.appliedFilters
    ? describeFilters(bundle.appliedFilters)
    : null;
  if (filterSummary) {
    parts.push(`_Filters: ${filterSummary}_`, "");
  }

  if (bundle.linkedRefs.length === 0) {
    if (filterSummary) {
      parts.push("_No linked references matched the current filters._", "");
    } else {
      parts.push("_No linked references._", "");
    }
  } else {
    for (const group of bundle.linkedRefs) {
      const fromTitle = pageTitle(group.page);
      parts.push(`## From [[${fromTitle}]]`, "");
      const refLines = blocksToMarkdown(group.blocks, options.linkStyle, 0);
      if (refLines.length === 0) {
        parts.push("_No blocks._", "");
      } else {
        parts.push(...refLines, "");
      }
    }
  }

  return finishMarkdown(parts);
}

export function serializeExport(bundle: ExportBundle, options: SerializeOptions): string {
  const title = pageTitle(bundle.page);
  const parts: string[] = [`# ${title}`, ""];

  const props = propertiesToMarkdown(pageProperties(bundle.page), options.linkStyle);
  if (props.length > 0) {
    parts.push(...props, "");
  }

  const bodyLines = blocksToMarkdown(
    withoutDuplicatedPageProperties(bundle.body, pageProperties(bundle.page)),
    options.linkStyle,
  );
  if (bodyLines.length > 0) {
    parts.push(...bodyLines, "");
  }

  parts.push("---", "", `## ${options.headingForRefs}`, "");

  const filterSummary = bundle.appliedFilters
    ? describeFilters(bundle.appliedFilters)
    : null;
  if (filterSummary) {
    parts.push(`_Filters: ${filterSummary}_`, "");
  }

  if (bundle.linkedRefs.length === 0) {
    if (filterSummary) {
      parts.push("_No linked references matched the current filters._", "");
    } else {
      parts.push("_No linked references._", "");
    }
  } else {
    for (const group of bundle.linkedRefs) {
      const fromTitle = pageTitle(group.page);
      parts.push(`### From [[${fromTitle}]]`, "");
      const refLines = blocksToMarkdown(group.blocks, options.linkStyle, 0);
      if (refLines.length === 0) {
        parts.push("_No blocks._", "");
      } else {
        parts.push(...refLines, "");
      }
    }
  }

  return finishMarkdown(parts);
}

const FORMAT_EXTENSION: Record<ExportFormat, string> = {
  markdown: "md",
  "markdown-zip": "zip",
  html: "html",
  plain: "txt",
};

export function exportBasename(page: PageEntity, filters?: FilterOptions): string {
  const base = `${sanitizeFilename(pageTitle(page))}-with-linked-references`;
  const suffix = filters && filtersAreActive(filters) ? "-filtered" : "";
  return `${base}${suffix}`;
}

export function exportFilename(
  page: PageEntity,
  filters?: FilterOptions,
  format: ExportFormat = "markdown",
): string {
  return `${exportBasename(page, filters)}.${FORMAT_EXTENSION[format]}`;
}
