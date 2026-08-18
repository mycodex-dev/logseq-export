import { countRefBlocks, describeFilters } from "./filter-refs";
import {
  exportBasename,
  pageTitle,
  serializeLinkedRefsMarkdown,
  serializePageMarkdown,
} from "./serialize-md";
import type { ExportBundle, SerializeOptions } from "./types";
import { filtersAreActive } from "./types";

export interface ZipMeta {
  plugin: string;
  version: string;
  exportedAt: string;
  rootPage: string;
  modes: string[];
  format: "markdown-zip";
  blockCount: number;
  refGroupCount: number;
  linkedRefBlockCount: number;
  linkedRefCountBeforeFilter?: number;
  filters: ReturnType<typeof describeFilters> | null;
  filtersActive: boolean;
}

export function buildZipMeta(
  bundle: ExportBundle,
  pluginVersion = "0.2.1",
): ZipMeta {
  const filtersActive = !!(
    bundle.appliedFilters && filtersAreActive(bundle.appliedFilters)
  );
  return {
    plugin: "logseq-export",
    version: pluginVersion,
    exportedAt: new Date().toISOString(),
    rootPage: pageTitle(bundle.page),
    modes: ["page-body", "linked-references"],
    format: "markdown-zip",
    blockCount: countBlocks(bundle.body),
    refGroupCount: bundle.linkedRefs.length,
    linkedRefBlockCount: countRefBlocks(bundle.linkedRefs),
    linkedRefCountBeforeFilter: bundle.linkedRefCountBeforeFilter,
    filters: bundle.appliedFilters ? describeFilters(bundle.appliedFilters) : null,
    filtersActive,
  };
}

function countBlocks(blocks: ExportBundle["body"]): number {
  let n = 0;
  for (const block of blocks) {
    n += 1;
    const children = (block.children as ExportBundle["body"] | undefined) ?? [];
    if (children.length) n += countBlocks(children);
  }
  return n;
}

export async function packageMarkdownZip(
  bundle: ExportBundle,
  options: SerializeOptions,
  pluginVersion?: string,
): Promise<Blob> {
  // Lazy-load JSZip so it is not part of the plugin startup graph.
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const folderName = exportBasename(bundle.page, bundle.appliedFilters);
  const folder = zip.folder(folderName);
  if (!folder) {
    throw new Error("Could not create ZIP folder.");
  }

  folder.file("index.md", serializePageMarkdown(bundle, options));
  folder.file("linked-references.md", serializeLinkedRefsMarkdown(bundle, options));
  folder.file(
    "meta.json",
    `${JSON.stringify(buildZipMeta(bundle, pluginVersion), null, 2)}\n`,
  );

  const content = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
  });
  return new Blob([content], { type: "application/zip" });
}
