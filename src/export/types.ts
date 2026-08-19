import type { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin.user";

export type LinkStyle = "keep" | "bold" | "plain";

/** How linked-reference groups are ordered in the export. */
export type LinkedRefSort = "newest-first" | "oldest-first" | "alphabetical";

export const LINKED_REF_SORT_CHOICES = [
  "newest-first",
  "oldest-first",
  "alphabetical",
] as const satisfies readonly LinkedRefSort[];

/** Canonical format ids. Legacy settings value `zip` maps to `markdown-zip`. */
export type ExportFormat = "markdown" | "markdown-zip" | "html" | "plain";

export type TagMatchMode = "any" | "all";

export interface FilterOptions {
  includeTags: string[];
  excludeTags: string[];
  tagMatch: TagMatchMode;
  dateFrom: string | null;
  dateTo: string | null;
  dropUndatedRefs: boolean;
  matchSourcePageTags: boolean;
}

export interface ExportSettings {
  defaultFormat: ExportFormat;
  includeParentPath: boolean;
  linkedRefSort: LinkedRefSort;
  linkStyle: LinkStyle;
  headingForRefs: string;
  filters: FilterOptions;
}

export interface LinkedRefGroup {
  page: PageEntity;
  blocks: BlockEntity[];
}

export interface ExportBundle {
  page: PageEntity;
  body: BlockEntity[];
  linkedRefs: LinkedRefGroup[];
  appliedFilters?: FilterOptions;
  /** Ref block count before filters were applied (for toasts / provenance). */
  linkedRefCountBeforeFilter?: number;
}

export interface SerializeOptions {
  includeParentPath: boolean;
  linkStyle: LinkStyle;
  headingForRefs: string;
}

export interface RenderedExport {
  filename: string;
  mime: string;
  blob: Blob;
}

export function emptyFilters(): FilterOptions {
  return {
    includeTags: [],
    excludeTags: [],
    tagMatch: "any",
    dateFrom: null,
    dateTo: null,
    dropUndatedRefs: false,
    matchSourcePageTags: false,
  };
}

export function filtersAreActive(filters: FilterOptions): boolean {
  return (
    filters.includeTags.length > 0 ||
    filters.excludeTags.length > 0 ||
    filters.dateFrom != null ||
    filters.dateTo != null
  );
}

export function formatLabel(format: ExportFormat): string {
  switch (format) {
    case "markdown":
      return "Markdown";
    case "markdown-zip":
      return "Markdown ZIP";
    case "html":
      return "HTML";
    case "plain":
      return "plain text";
  }
}
