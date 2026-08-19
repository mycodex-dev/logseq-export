import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";
import { describeFilters } from "./filter-refs";
import { pageTitle, rewriteLinks, withoutDuplicatedPageProperties } from "./serialize-md";
import type { ExportBundle, LinkStyle, SerializeOptions } from "./types";

function blockContent(block: BlockEntity): string {
  return typeof block.content === "string" ? block.content : "";
}

function blocksToPlain(
  blocks: BlockEntity[],
  linkStyle: LinkStyle,
  depth = 0,
): string[] {
  const lines: string[] = [];
  for (const block of blocks) {
    const content = blockContent(block);
    const children = (block.children as BlockEntity[] | undefined) ?? [];
    if (!content.trim() && children.length === 0) continue;

    const indent = "  ".repeat(depth);
    const text = rewriteLinks(content, linkStyle).trimEnd();
    lines.push(text ? `${indent}- ${text}` : `${indent}-`);
    if (children.length > 0) {
      lines.push(...blocksToPlain(children, linkStyle, depth + 1));
    }
  }
  return lines;
}

function propertiesToPlain(
  properties: Record<string, unknown> | undefined,
  linkStyle: LinkStyle,
): string[] {
  if (!properties || Object.keys(properties).length === 0) return [];
  const lines: string[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (key === "id" || key === "title") continue;
    const rendered =
      value == null
        ? ""
        : Array.isArray(value)
          ? value.map(String).join(", ")
          : String(value);
    lines.push(`${key}: ${rewriteLinks(rendered, linkStyle)}`);
  }
  return lines;
}

/**
 * Plain-text export. Defaults callers should pass linkStyle "plain"
 * unless the user explicitly chose keep/bold in settings.
 */
export function serializePlain(bundle: ExportBundle, options: SerializeOptions): string {
  const title = pageTitle(bundle.page);
  const parts: string[] = [title, "=".repeat(Math.min(title.length, 72)), ""];

  const props = propertiesToPlain(
    bundle.page.properties as Record<string, unknown> | undefined,
    options.linkStyle,
  );
  if (props.length > 0) {
    parts.push(...props, "");
  }

  const body = blocksToPlain(
    withoutDuplicatedPageProperties(
      bundle.body,
      bundle.page.properties as Record<string, unknown> | undefined,
    ),
    options.linkStyle,
  );
  if (body.length > 0) {
    parts.push(...body, "");
  }

  parts.push("-".repeat(40), "", options.headingForRefs, "");

  const filterSummary = bundle.appliedFilters
    ? describeFilters(bundle.appliedFilters)
    : null;
  if (filterSummary) {
    parts.push(`Filters: ${filterSummary}`, "");
  }

  if (bundle.linkedRefs.length === 0) {
    parts.push(
      filterSummary
        ? "No linked references matched the current filters."
        : "No linked references.",
      "",
    );
  } else {
    for (const group of bundle.linkedRefs) {
      const from = pageTitle(group.page);
      parts.push(`From: ${from}`, "");
      const refLines = blocksToPlain(group.blocks, options.linkStyle);
      if (refLines.length === 0) {
        parts.push("No blocks.", "");
      } else {
        parts.push(...refLines, "");
      }
    }
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
