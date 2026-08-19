import { describe, expect, it } from "vitest";
import { parseEntryPointSettings } from "./settings";

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
