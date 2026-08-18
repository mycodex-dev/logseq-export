import type { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin.user";

/** Normalize a raw tag token to a comparable name (lowercase, no leading #). */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, "").toLowerCase();
}

/** Parse a comma-separated tag list from settings / dialog input. */
export function parseTagList(input: string): string[] {
  if (!input.trim()) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of input.split(/[,，]/)) {
    const tag = normalizeTag(part);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

const HASH_TAG_RE = /(?:^|[\s([{])#([^\s#[[\](){},，]+)/g;
const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

function addTag(target: Set<string>, raw: string): void {
  const tag = normalizeTag(raw);
  if (tag) target.add(tag);
}

function collectFromString(value: string, target: Set<string>): void {
  HASH_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HASH_TAG_RE.exec(value)) != null) {
    addTag(target, match[1]);
  }

  WIKI_LINK_RE.lastIndex = 0;
  while ((match = WIKI_LINK_RE.exec(value)) != null) {
    addTag(target, match[1]);
  }
}

function collectFromUnknown(value: unknown, target: Set<string>): void {
  if (value == null) return;
  if (typeof value === "string") {
    // Property values may be plain tag names or include # / [[ ]]
    if (value.includes("#") || value.includes("[[")) {
      collectFromString(value, target);
    } else {
      addTag(target, value);
    }
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    addTag(target, String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectFromUnknown(item, target);
  }
}

/**
 * Extract tag names from block content (#tag / [[tag]]) and properties
 * (especially `tags`, but any string/array property values are scanned).
 */
export function extractTagsFromBlock(block: BlockEntity): Set<string> {
  const tags = new Set<string>();
  const content = typeof block.content === "string" ? block.content : "";
  if (content) collectFromString(content, tags);

  const properties = block.properties as Record<string, unknown> | undefined;
  if (properties) {
    for (const value of Object.values(properties)) {
      collectFromUnknown(value, tags);
    }
  }

  return tags;
}

export function extractTagsFromPage(page: PageEntity): Set<string> {
  const tags = new Set<string>();
  const properties = page.properties as Record<string, unknown> | undefined;
  if (properties) {
    for (const value of Object.values(properties)) {
      collectFromUnknown(value, tags);
    }
  }
  // Page name itself can be a tag page
  if (page.originalName) addTag(tags, page.originalName);
  else if (page.name) addTag(tags, page.name);
  return tags;
}

export function blockHasTag(block: BlockEntity, tag: string): boolean {
  return extractTagsFromBlock(block).has(normalizeTag(tag));
}
