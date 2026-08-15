import type { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin.user";
import { describeFilters } from "./filter-refs";
import type { ExportBundle, FilterOptions, LinkStyle, SerializeOptions } from "./types";
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

function pageTitle(page: PageEntity): string {
  return page.originalName || page.name || "Untitled";
}

function propertiesToMarkdown(
  properties: Record<string, unknown> | undefined,
  linkStyle: LinkStyle,
): string[] {
  if (!properties || Object.keys(properties).length === 0) return [];

  const lines: string[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (key === "id" || key === "title") continue;
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
  const content = blockContent(block).trim();
  if (!content) return true;
  return false;
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
    if (content.trim()) {
      lines.push(`${indent}- ${content}`);
    } else {
      lines.push(`${indent}-`);
    }

    const children = (block.children as BlockEntity[] | undefined) ?? [];
    if (children.length > 0) {
      lines.push(...blocksToMarkdown(children, linkStyle, depth + 1));
    }
  }

  return lines;
}

function linkedRefBlocksToMarkdown(
  blocks: BlockEntity[],
  options: SerializeOptions,
): string[] {
  return blocksToMarkdown(blocks, options.linkStyle, 0);
}

export function serializeExport(bundle: ExportBundle, options: SerializeOptions): string {
  const title = pageTitle(bundle.page);
  const parts: string[] = [`# ${title}`, ""];

  const props = propertiesToMarkdown(
    bundle.page.properties as Record<string, unknown> | undefined,
    options.linkStyle,
  );
  if (props.length > 0) {
    parts.push(...props, "");
  }

  const bodyLines = blocksToMarkdown(bundle.body, options.linkStyle);
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
      const refLines = linkedRefBlocksToMarkdown(group.blocks, options);
      if (refLines.length === 0) {
        parts.push("_No blocks._", "");
      } else {
        parts.push(...refLines, "");
      }
    }
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export function exportFilename(page: PageEntity, filters?: FilterOptions): string {
  const base = `${sanitizeFilename(pageTitle(page))}-with-linked-references`;
  const suffix = filters && filtersAreActive(filters) ? "-filtered" : "";
  return `${base}${suffix}.md`;
}
