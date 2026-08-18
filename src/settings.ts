import type { SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";
import { parseIsoDate } from "./export/dates";
import { parseTagList } from "./export/parse-tags";
import type {
  ExportSettings,
  ExportFormat,
  FilterOptions,
  LinkStyle,
  TagMatchMode,
} from "./export/types";
import { emptyFilters } from "./export/types";

const FORMAT_CHOICES = ["markdown", "markdown-zip", "html", "plain"] as const;

export const settingsSchema: SettingSchemaDesc[] = [
  {
    key: "defaultFormat",
    type: "enum",
    title: "Default export format",
    description:
      "markdown = single .md; markdown-zip = multi-file ZIP; html = self-contained page; plain = .txt",
    default: "markdown",
    enumChoices: [...FORMAT_CHOICES],
    enumPicker: "select",
  },
  {
    key: "includeParentPath",
    type: "boolean",
    title: "Include parent path for linked references",
    description:
      "When enabled, ancestor blocks above each matching backlink are included for context.",
    default: true,
  },
  {
    key: "linkStyle",
    type: "enum",
    title: "Wiki-link style in export",
    description: "How [[Page]] links are rewritten in the exported Markdown / text / HTML.",
    default: "keep",
    enumChoices: ["keep", "bold", "plain"],
    enumPicker: "select",
  },
  {
    key: "headingForRefs",
    type: "string",
    title: "Linked references heading",
    description: "Section title used above the backlinks in the export.",
    default: "Linked References",
  },
  {
    key: "filterIncludeTags",
    type: "string",
    title: "Filter: include tags",
    description:
      "Comma-separated tags. When set, only linked-reference blocks with these tags are kept (see match mode).",
    default: "",
  },
  {
    key: "filterExcludeTags",
    type: "string",
    title: "Filter: exclude tags",
    description: "Comma-separated tags. Linked-reference blocks with any of these tags are dropped.",
    default: "",
  },
  {
    key: "filterTagMatch",
    type: "enum",
    title: "Filter: include-tag match mode",
    description: "When multiple include tags are set: any = OR, all = AND.",
    default: "any",
    enumChoices: ["any", "all"],
    enumPicker: "select",
  },
  {
    key: "filterDateFrom",
    type: "string",
    title: "Filter: from date",
    description: "Inclusive start date as YYYY-MM-DD. Leave blank for open-ended.",
    default: "",
  },
  {
    key: "filterDateTo",
    type: "string",
    title: "Filter: to date",
    description: "Inclusive end date as YYYY-MM-DD. Leave blank for open-ended.",
    default: "",
  },
  {
    key: "dropUndatedRefs",
    type: "boolean",
    title: "Filter: drop undated refs",
    description:
      "When a date range is set, drop linked references that have no resolvable journal/block date.",
    default: false,
  },
  {
    key: "filterSourcePageTags",
    type: "boolean",
    title: "Filter: also match source page tags",
    description:
      "When enabled, include/exclude tag rules also consider tags on the backlink’s source page.",
    default: false,
  },
];

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function readFormat(raw: unknown): ExportFormat {
  // Legacy setting value from early builds
  if (raw === "zip") return "markdown-zip";
  return asEnum<ExportFormat>(raw, FORMAT_CHOICES, "markdown");
}

function readFilters(raw: Record<string, unknown>): FilterOptions {
  const base = emptyFilters();
  return {
    ...base,
    includeTags: parseTagList(typeof raw.filterIncludeTags === "string" ? raw.filterIncludeTags : ""),
    excludeTags: parseTagList(typeof raw.filterExcludeTags === "string" ? raw.filterExcludeTags : ""),
    tagMatch: asEnum<TagMatchMode>(raw.filterTagMatch, ["any", "all"], "any"),
    dateFrom: parseIsoDate(typeof raw.filterDateFrom === "string" ? raw.filterDateFrom : ""),
    dateTo: parseIsoDate(typeof raw.filterDateTo === "string" ? raw.filterDateTo : ""),
    dropUndatedRefs: raw.dropUndatedRefs === true,
    matchSourcePageTags: raw.filterSourcePageTags === true,
  };
}

export function readExportSettings(): ExportSettings {
  const raw = (logseq.settings ?? {}) as Record<string, unknown>;

  return {
    defaultFormat: readFormat(raw.defaultFormat),
    includeParentPath: raw.includeParentPath !== false,
    linkStyle: asEnum<LinkStyle>(raw.linkStyle, ["keep", "bold", "plain"], "keep"),
    headingForRefs:
      typeof raw.headingForRefs === "string" && raw.headingForRefs.trim()
        ? raw.headingForRefs.trim()
        : "Linked References",
    filters: readFilters(raw),
  };
}
