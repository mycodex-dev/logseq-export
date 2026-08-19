import type { SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";
import { parseIsoDate } from "./export/dates";
import { parseTagList } from "./export/parse-tags";
import type {
  ExportSettings,
  ExportFormat,
  FilterOptions,
  LinkedRefSort,
  LinkStyle,
  TagMatchMode,
} from "./export/types";
import { emptyFilters, LINKED_REF_SORT_CHOICES } from "./export/types";

const FORMAT_CHOICES = ["markdown", "markdown-zip", "html", "plain"] as const;

export interface EntryPointSettings {
  enableCommandPalette: boolean;
  enableSlashCommand: boolean;
  enablePageMenu: boolean;
  enableToolbar: boolean;
  enablePageHeader: boolean;
  enableShortcut: boolean;
  shortcutBinding: string;
}

export const settingsSchema: SettingSchemaDesc[] = [
  {
    key: "entryPointsHeading",
    type: "heading",
    title: "How to run export",
    description:
      "Choose where Export page with linked references appears. Turning a command off (palette, slash, page menu, or shortcut) may require disabling and re-enabling the plugin.",
    default: "",
  },
  {
    key: "enableCommandPalette",
    type: "boolean",
    title: "Command palette",
    description: "Show Export page with linked references in the command palette.",
    default: true,
  },
  {
    key: "enableSlashCommand",
    type: "boolean",
    title: "Slash command",
    description: "Register /Export page with linked references in the editor.",
    default: true,
  },
  {
    key: "enablePageMenu",
    type: "boolean",
    title: "Page menu",
    description: "Add the command to the page ••• menu.",
    default: true,
  },
  {
    key: "enableToolbar",
    type: "boolean",
    title: "Toolbar icon",
    description: "Show an export button in the top plugin toolbar.",
    default: true,
  },
  {
    key: "enablePageHeader",
    type: "boolean",
    title: "Page title button",
    description: "Show an export button next to the page title.",
    default: true,
  },
  {
    key: "enableShortcut",
    type: "boolean",
    title: "Keyboard shortcut",
    description:
      "Bind a chord to export. Uses the command-palette command; changing the chord after first load may require a plugin reload.",
    default: false,
  },
  {
    key: "shortcutBinding",
    type: "string",
    title: "Shortcut chord",
    description: "Logseq keybinding when the shortcut is enabled, e.g. mod+shift+e. Leave blank for none.",
    default: "",
  },
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
    key: "linkedRefSort",
    type: "enum",
    title: "Linked references sort order",
    description:
      "newest-first = journals by date descending (matches Logseq); oldest-first = journals oldest first; alphabetical = by source page name.",
    default: "newest-first",
    enumChoices: [...LINKED_REF_SORT_CHOICES],
    enumPicker: "select",
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

function asBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  return defaultValue;
}

export function parseEntryPointSettings(raw: Record<string, unknown>): EntryPointSettings {
  const shortcutBinding = typeof raw.shortcutBinding === "string" ? raw.shortcutBinding.trim() : "";
  return {
    enableCommandPalette: asBoolean(raw.enableCommandPalette, true),
    enableSlashCommand: asBoolean(raw.enableSlashCommand, true),
    enablePageMenu: asBoolean(raw.enablePageMenu, true),
    enableToolbar: asBoolean(raw.enableToolbar, true),
    enablePageHeader: asBoolean(raw.enablePageHeader, true),
    enableShortcut: asBoolean(raw.enableShortcut, false),
    shortcutBinding,
  };
}

export function readEntryPointSettings(): EntryPointSettings {
  return parseEntryPointSettings((logseq.settings ?? {}) as Record<string, unknown>);
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

export function parseExportSettings(raw: Record<string, unknown>): ExportSettings {
  return {
    defaultFormat: readFormat(raw.defaultFormat),
    includeParentPath: raw.includeParentPath !== false,
    linkedRefSort: asEnum<LinkedRefSort>(raw.linkedRefSort, LINKED_REF_SORT_CHOICES, "newest-first"),
    linkStyle: asEnum<LinkStyle>(raw.linkStyle, ["keep", "bold", "plain"], "keep"),
    headingForRefs:
      typeof raw.headingForRefs === "string" && raw.headingForRefs.trim()
        ? raw.headingForRefs.trim()
        : "Linked References",
    filters: readFilters(raw),
  };
}

export function readExportSettings(): ExportSettings {
  return parseExportSettings((logseq.settings ?? {}) as Record<string, unknown>);
}
