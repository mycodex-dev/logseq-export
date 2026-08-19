import type { BlockEntity, PageEntity, PageIdentity } from "@logseq/libs/dist/LSPlugin.user";
import { dateRangeIsValid, journalDayToIso, parseJournalTitle } from "./dates";
import { countRefBlocks, filterLinkedRefs } from "./filter-refs";
import type { ExportBundle, FilterOptions, LinkedRefGroup } from "./types";
import { emptyFilters } from "./types";

type ParentLike = { id?: number | string; uuid?: string } | number | string | undefined | null;

function pageLabel(page: PageEntity): string {
  return page.originalName || page.name || String(page.uuid ?? "Unknown");
}

function isBlockEntity(value: unknown): value is BlockEntity {
  return typeof value === "object" && value != null && "content" in value;
}

function blockRefs(block: BlockEntity): Array<string | number> {
  const refs: Array<string | number> = [];
  if (typeof block.uuid === "string" && block.uuid) refs.push(block.uuid);
  if (typeof block.id === "number" || (typeof block.id === "string" && block.id)) {
    refs.push(block.id);
  }
  return refs;
}

/** Parent db id or uuid from the shapes Logseq actually returns. */
export function parentRef(block: BlockEntity): string | number | null {
  const parent = block.parent as ParentLike;
  if (parent == null) return null;
  if (typeof parent === "string" || typeof parent === "number") return parent;
  if (typeof parent === "object") {
    if (typeof parent.uuid === "string" && parent.uuid) return parent.uuid;
    if (typeof parent.id === "number") return parent.id;
    if (typeof parent.id === "string" && parent.id) return parent.id;
  }
  return null;
}

function parentIdentity(block: BlockEntity): string | number | null {
  return parentRef(block);
}

function hasRenderableChildren(block: BlockEntity): boolean {
  const children = (block.children as unknown[] | undefined) ?? [];
  return children.some((child) => isBlockEntity(child) && typeof child.content === "string");
}

/**
 * Keep only the backlink hits whose parent is not also in the same group.
 * `getPageLinkedReferences` often returns the matched block plus its
 * descendants as a flat list; descendants should nest under the hit.
 */
export function linkedRefRoots(blocks: BlockEntity[]): BlockEntity[] {
  const ids = new Set<string | number>();
  for (const block of blocks) {
    for (const ref of blockRefs(block)) ids.add(ref);
  }

  const roots: BlockEntity[] = [];
  const seen = new Set<string | number>();
  for (const block of blocks) {
    const key = typeof block.uuid === "string" && block.uuid ? block.uuid : block.id;
    if (key != null) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const parent = parentRef(block);
    if (parent != null && ids.has(parent)) continue;
    roots.push(block);
  }
  return roots;
}

function attachKnownChildren(root: BlockEntity, pool: BlockEntity[]): BlockEntity {
  const rootIds = new Set(blockRefs(root));
  const children = pool.filter((block) => {
    if (block === root) return false;
    const parent = parentRef(block);
    return parent != null && rootIds.has(parent);
  });
  return {
    ...root,
    children: children.map((child) => attachKnownChildren(child, pool)),
  };
}

/** Journal calendar day for sorting: journalDay, then parsed title. */
export function pageJournalDay(page: PageEntity): string | null {
  const extra = page as PageEntity & {
    journalDay?: number;
    journal?: boolean;
    "journal?"?: boolean;
  };
  const fromDay = journalDayToIso(extra.journalDay);
  if (fromDay) return fromDay;

  const title = page.originalName || page.name;
  const fromTitle = parseJournalTitle(title);
  if (fromTitle) return fromTitle;

  if (extra.journal === true || extra["journal?"] === true) {
    return journalDayToIso(page.name);
  }
  return null;
}

/**
 * Match Logseq’s linked-references UI: journal pages newest-first, then
 * other pages alphabetically.
 */
export function sortLinkedRefGroups(groups: LinkedRefGroup[]): LinkedRefGroup[] {
  return [...groups].sort((a, b) => {
    const dateA = pageJournalDay(a.page);
    const dateB = pageJournalDay(b.page);
    if (dateA && dateB && dateA !== dateB) return dateB.localeCompare(dateA);
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;
    return pageLabel(a.page).localeCompare(pageLabel(b.page));
  });
}

async function hydrateWithChildren(block: BlockEntity): Promise<BlockEntity> {
  const id = typeof block.uuid === "string" && block.uuid ? block.uuid : block.id;
  if (id == null) return block;

  const full = (await logseq.Editor.getBlock(id, {
    includeChildren: true,
  })) as BlockEntity | null;
  if (!full) return block;

  return {
    ...full,
    children: (full.children as BlockEntity[] | undefined) ?? [],
  };
}

async function enrichRefBlock(
  block: BlockEntity,
  pool: BlockEntity[],
  includeParentPath: boolean,
  stopTitles: readonly string[],
): Promise<BlockEntity> {
  let tree = await hydrateWithChildren(block);
  if (!hasRenderableChildren(tree) && pool.length > 1) {
    tree = attachKnownChildren(block, pool);
  }
  return includeParentPath ? await withParentPath(tree, 20, stopTitles) : tree;
}

/**
 * Walk ancestors and nest the matched block under its parent chain
 * (root ancestor → … → matched block), capped for safety.
 */
export async function withParentPath(
  block: BlockEntity,
  maxDepth = 20,
  stopTitles: readonly string[] = [],
): Promise<BlockEntity> {
  let current: BlockEntity = {
    ...block,
    children: (block.children as BlockEntity[] | undefined) ?? [],
  };
  const stops = new Set(stopTitles.map((title) => title.trim()).filter(Boolean));

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const parentId = parentIdentity(current);
    if (parentId == null) break;

    const parent = (await logseq.Editor.getBlock(parentId, {
      includeChildren: false,
    })) as BlockEntity | null;

    if (!parent) break;

    // Stop at page-root wrappers that only mirror the page title
    const parentContent = typeof parent.content === "string" ? parent.content.trim() : "";
    if (!parentContent) break;
    if (stops.has(parentContent)) break;

    current = {
      ...parent,
      children: [current],
    };
  }

  return current;
}

export interface CollectOptions {
  includeParentPath?: boolean;
  filters?: FilterOptions;
}

export async function collectExport(
  root: PageIdentity,
  options: CollectOptions = {},
): Promise<ExportBundle> {
  const page = await logseq.Editor.getPage(root);
  if (!page) {
    throw new Error("Could not load the current page.");
  }

  const filters = options.filters ?? emptyFilters();
  if (!dateRangeIsValid(filters.dateFrom, filters.dateTo)) {
    throw new Error("Invalid date range: “from” must be on or before “to”.");
  }

  const body = (await logseq.Editor.getPageBlocksTree(root)) ?? [];
  const linked = (await logseq.Editor.getPageLinkedReferences(root)) ?? [];
  const includeParentPath = options.includeParentPath !== false;

  const rawGroups: LinkedRefGroup[] = [];

  for (const entry of linked) {
    if (!Array.isArray(entry) || entry[0] == null || !Array.isArray(entry[1])) continue;
    const [refPage, blocks] = entry as [PageEntity, BlockEntity[]];
    rawGroups.push({ page: refPage, blocks });
  }

  const beforeCount = countRefBlocks(rawGroups);
  const filteredGroups = filterLinkedRefs(rawGroups, filters);

  const linkedRefs: LinkedRefGroup[] = [];
  for (const group of filteredGroups) {
    const roots = linkedRefRoots(group.blocks);
    const stopTitles = [pageLabel(group.page), group.page.name, group.page.originalName];
    const enriched: BlockEntity[] = [];
    for (const block of roots) {
      enriched.push(await enrichRefBlock(block, group.blocks, includeParentPath, stopTitles));
    }
    linkedRefs.push({ page: group.page, blocks: enriched });
  }

  return {
    page,
    body,
    linkedRefs: sortLinkedRefGroups(linkedRefs),
    appliedFilters: filters,
    linkedRefCountBeforeFilter: beforeCount,
  };
}
