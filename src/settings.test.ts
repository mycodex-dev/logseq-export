import { describe, expect, it } from "vitest";
import { parseEntryPointSettings, parseExportSettings } from "./settings";
import { emptyFilters } from "./export/types";

describe("parseEntryPointSettings", () => {
  it("defaults visible entries on and shortcut off", () => {
    expect(parseEntryPointSettings({})).toEqual({
      enableCommandPalette: true,
      enableSlashCommand: true,
      enablePageMenu: true,
      enableToolbar: true,
      enablePageHeader: true,
      enableShortcut: false,
      shortcutBinding: "",
    });
  });

  it("honors explicit booleans and trims the shortcut chord", () => {
    expect(
      parseEntryPointSettings({
        enableCommandPalette: false,
        enableSlashCommand: false,
        enablePageMenu: false,
        enableToolbar: false,
        enablePageHeader: false,
        enableShortcut: true,
        shortcutBinding: "  mod+shift+e  ",
      }),
    ).toEqual({
      enableCommandPalette: false,
      enableSlashCommand: false,
      enablePageMenu: false,
      enableToolbar: false,
      enablePageHeader: false,
      enableShortcut: true,
      shortcutBinding: "mod+shift+e",
    });
  });
});

describe("parseExportSettings", () => {
  it("defaults linked-reference sort to newest-first", () => {
    expect(parseExportSettings({}).linkedRefSort).toBe("newest-first");
    expect(parseExportSettings({}).filters).toEqual(emptyFilters());
  });

  it("reads a valid sort order and falls back on unknown values", () => {
    expect(parseExportSettings({ linkedRefSort: "oldest-first" }).linkedRefSort).toBe(
      "oldest-first",
    );
    expect(parseExportSettings({ linkedRefSort: "alphabetical" }).linkedRefSort).toBe(
      "alphabetical",
    );
    expect(parseExportSettings({ linkedRefSort: "db-id" }).linkedRefSort).toBe("newest-first");
  });
});
