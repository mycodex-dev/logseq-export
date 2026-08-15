import type { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin.user";
import { inDateRange, journalDayToIso, timestampToLocalIso } from "./dates";
import { extractTagsFromBlock, extractTagsFromPage, normalizeTag } from "./parse-tags";
import type { FilterOptions, LinkedRefGroup } from "./types";
import { filtersAreActive } from "./types";

type BlockWithMeta = BlockEntity & {
  createdAt?: number;
  updatedAt?: number;
  "created-at"?: number;
  "updated-at"?: number;
};

function readBlockTimestamp(block: BlockEntity): number | null {
  const b = block as BlockWithMeta;
  const candidates = [b.createdAt, b["created-at"], b.updatedAt, b["updated-at"]];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * Resolve an effective YYYY-MM-DD for a linked-ref block.
 * Prefer journal page day, then block created/updated timestamps.
 */
export function effectiveDate(page: PageEntity, block: BlockEntity): string | null {
  const journalFlag = (page as PageEntity & { journal?: boolean; "journal?"?: boolean }).journal
    ?? (page as PageEntity & { "journal?"?: boolean })["journal?"];
  const journalDay = (page as PageEntity & { journalDay?: number }).journalDay;

  if (journalDay != null) {
    const fromJournal = journalDayToIso(journalDay);
    if (fromJournal) return fromJournal;
  }
  if (journalFlag) {
    // Some builds expose journal without journalDay; try name digits as last resort
    const fromName = journalDayToIso(page.name);
    if (fromName) return fromName;
  }

  return timestampToLocalIso(readBlockTimestamp(block));
}

function passesIncludeTags(
  blockTags: Set<string>,
  pageTags: Set<string>,
  filters: FilterOptions,
): boolean {
  if (filters.includeTags.length === 0) return true;

  const pool = new Set(blockTags);
  if (filters.matchSourcePageTags) {
    for (const tag of pageTags) pool.add(tag);
  }

  if (filters.tagMatch === "all") {
    return filters.includeTags.every((tag) => pool.has(tag));
  }
  return filters.includeTags.some((tag) => pool.has(tag));
}

function passesExcludeTags(
  blockTags: Set<string>,
  pageTags: Set<string>,
  filters: FilterOptions,
): boolean {
  if (filters.excludeTags.length === 0) return true;

  const pool = new Set(blockTags);
  if (filters.matchSourcePageTags) {
    for (const tag of pageTags) pool.add(tag);
  }

  return !filters.excludeTags.some((tag) => pool.has(tag));
}

export function blockPassesFilters(
  page: PageEntity,
  block: BlockEntity,
  filters: FilterOptions,
): boolean {
  const blockTags = extractTagsFromBlock(block);
  const pageTags = filters.matchSourcePageTags ? extractTagsFromPage(page) : new Set<string>();

  if (!passesIncludeTags(blockTags, pageTags, filters)) return false;
  if (!passesExcludeTags(blockTags, pageTags, filters)) return false;

  const day = effectiveDate(page, block);
  if (!inDateRange(day, filters.dateFrom, filters.dateTo, filters.dropUndatedRefs)) {
    return false;
  }

  return true;
}

export function filterLinkedRefs(
  groups: LinkedRefGroup[],
  filters: FilterOptions,
): LinkedRefGroup[] {
  const dateFilterOn = filters.dateFrom != null || filters.dateTo != null;
  if (!filtersAreActive(filters) && !(filters.dropUndatedRefs && dateFilterOn)) {
    return groups;
  }

  const result: LinkedRefGroup[] = [];
  for (const group of groups) {
    const blocks = group.blocks.filter((block) => blockPassesFilters(group.page, block, filters));
    if (blocks.length === 0) continue;
    result.push({ page: group.page, blocks });
  }
  return result;
}

export function describeFilters(filters: FilterOptions): string | null {
  if (!filtersAreActive(filters)) return null;

  const parts: string[] = [];
  if (filters.includeTags.length > 0) {
    parts.push(
      `tags include ${filters.includeTags.map((t) => normalizeTag(t)).join(", ")} (${filters.tagMatch})`,
    );
  }
  if (filters.excludeTags.length > 0) {
    parts.push(`tags exclude ${filters.excludeTags.map((t) => normalizeTag(t)).join(", ")}`);
  }
  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ?? "…";
    const to = filters.dateTo ?? "…";
    parts.push(`from ${from} to ${to}`);
    if (filters.dropUndatedRefs) parts.push("drop undated");
  }
  if (filters.matchSourcePageTags) parts.push("match source page tags");

  return parts.join("; ");
}

export function countRefBlocks(groups: LinkedRefGroup[]): number {
  return groups.reduce((sum, group) => sum + group.blocks.length, 0);
}
