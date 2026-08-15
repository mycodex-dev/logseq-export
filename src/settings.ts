import type { SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";
import type { ExportSettings, ExportFormat, LinkStyle } from "./export/types";

export const settingsSchema: SettingSchemaDesc[] = [
  {
    key: "defaultFormat",
    type: "enum",
    title: "Default export format",
    description: "ZIP packaging lands in a later release; Markdown is used for now.",
    default: "markdown",
    enumChoices: ["markdown", "zip"],
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
    description: "How [[Page]] links are rewritten in the exported Markdown.",
    default: "keep",
    enumChoices: ["keep", "bold", "plain"],
    enumPicker: "select",
  },
  {
    key: "headingForRefs",
    type: "string",
    title: "Linked references heading",
    description: "Section title used above the backlinks in the single-file Markdown export.",
    default: "Linked References",
  },
];

function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function readExportSettings(): ExportSettings {
  const raw = (logseq.settings ?? {}) as Record<string, unknown>;

  return {
    defaultFormat: asEnum<ExportFormat>(raw.defaultFormat, ["markdown", "zip"], "markdown"),
    includeParentPath: raw.includeParentPath !== false,
    linkStyle: asEnum<LinkStyle>(raw.linkStyle, ["keep", "bold", "plain"], "keep"),
    headingForRefs:
      typeof raw.headingForRefs === "string" && raw.headingForRefs.trim()
        ? raw.headingForRefs.trim()
        : "Linked References",
  };
}
