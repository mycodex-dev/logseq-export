import type { BlockEntity, PageEntity, PageIdentity } from "@logseq/libs/dist/LSPlugin.user";
import type { ExportBundle, LinkedRefGroup } from "./types";

function pageLabel(page: PageEntity): string {
  return page.originalName || page.name || String(page.uuid ?? "Unknown");
}

function parentIdentity(block: BlockEntity): string | null {
  const parent = block.parent as { id?: number; uuid?: string } | number | string | undefined;
  if (parent == null) return null;
  if (typeof parent === "string") return parent;
  if (typeof parent === "number") return null;
  if (typeof parent === "object" && typeof parent.uuid === "string") return parent.uuid;
  return null;
}

/**
 * Walk ancestors and nest the matched block under its parent chain
 * (root ancestor → … → matched block), capped for safety.
 */
export async function withParentPath(
  block: BlockEntity,
  maxDepth = 20,
): Promise<BlockEntity> {
  let current: BlockEntity = {
    ...block,
    children: (block.children as BlockEntity[] | undefined) ?? [],
  };

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const parentId = parentIdentity(current);
    if (!parentId) break;

    const parent = (await logseq.Editor.getBlock(parentId, {
      includeChildren: false,
    })) as BlockEntity | null;

    if (!parent) break;

    // Stop at page-root wrappers that only mirror the page title
    const parentContent = typeof parent.content === "string" ? parent.content.trim() : "";
    if (!parentContent) break;

    current = {
      ...parent,
      children: [current],
    };
  }

  return current;
}

export async function collectExport(
  root: PageIdentity,
  options: { includeParentPath?: boolean } = {},
): Promise<ExportBundle> {
  const page = await logseq.Editor.getPage(root);
  if (!page) {
    throw new Error("Could not load the current page.");
  }

  const body = (await logseq.Editor.getPageBlocksTree(root)) ?? [];
  const linked = (await logseq.Editor.getPageLinkedReferences(root)) ?? [];
  const includeParentPath = options.includeParentPath !== false;

  const linkedRefs: LinkedRefGroup[] = [];

  for (const entry of linked) {
    if (!Array.isArray(entry) || entry[0] == null || !Array.isArray(entry[1])) continue;
    const [refPage, blocks] = entry as [PageEntity, BlockEntity[]];

    const enriched: BlockEntity[] = [];
    for (const block of blocks) {
      enriched.push(includeParentPath ? await withParentPath(block) : block);
    }

    linkedRefs.push({ page: refPage, blocks: enriched });
  }

  linkedRefs.sort((a, b) => pageLabel(a.page).localeCompare(pageLabel(b.page)));

  return { page, body, linkedRefs };
}
