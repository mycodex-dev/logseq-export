import "@logseq/libs";
import { collectExport } from "./export/collect";
import { downloadBlob } from "./export/download";
import { countRefBlocks } from "./export/filter-refs";
import { renderExport } from "./export/render";
import { filtersAreActive, formatLabel } from "./export/types";
import {
  type EntryPointSettings,
  parseEntryPointSettings,
  readEntryPointSettings,
  readExportSettings,
  settingsSchema,
} from "./settings";

const PLUGIN_VERSION = "0.2.0";
const COMMAND_LABEL = "Export page with linked references";
const PALETTE_KEY = "export-page-with-linked-references";
const TOOLBAR_KEY = "logseq-export-toolbar";
const TOOLBAR_BTN_CLASS = "logseq-export-toolbar-btn";
const PAGE_HEADER_UI_KEY = "logseq-export-page-header";
const PAGE_HEADER_BTN_CLASS = "logseq-export-page-header-btn";
const TOOLBAR_STYLE_KEY = "logseq-export-toolbar-visibility";
const RELOAD_HINT =
  "Reload the plugin (disable then enable) for this launch-option change to take effect.";

const registered = new Set<string>();
let pageHeaderSlot: string | null = null;
let pageHeaderHookInstalled = false;
let toolbarRegistered = false;

async function exportPage(identity?: string): Promise<void> {
  let root = identity?.trim() || undefined;
  if (!root) {
    const current = await logseq.Editor.getCurrentPage();
    const fromPage = current?.uuid ?? current?.name;
    root = typeof fromPage === "string" && fromPage ? fromPage : undefined;
  }
  if (!root) {
    await logseq.UI.showMsg("Open a page before exporting.", "warning");
    return;
  }

  try {
    const settings = readExportSettings();
    const bundle = await collectExport(root, {
      includeParentPath: settings.includeParentPath,
      filters: settings.filters,
    });

    const rendered = await renderExport(bundle, {
      format: settings.defaultFormat,
      includeParentPath: settings.includeParentPath,
      linkStyle: settings.linkStyle,
      headingForRefs: settings.headingForRefs,
      pluginVersion: PLUGIN_VERSION,
    });

    downloadBlob(rendered.filename, rendered.blob);

    const refCount = countRefBlocks(bundle.linkedRefs);
    const before = bundle.linkedRefCountBeforeFilter ?? refCount;
    const filtered = filtersAreActive(settings.filters);
    const title = bundle.page.originalName || bundle.page.name;
    const asFormat = formatLabel(settings.defaultFormat);
    const message = filtered
      ? `Exported “${title}” as ${asFormat} with ${refCount} linked reference block(s) (filtered from ${before}).`
      : `Exported “${title}” as ${asFormat} with ${refCount} linked reference block(s).`;
    await logseq.UI.showMsg(message, "success");
  } catch (error) {
    console.error("[logseq-export]", error);
    const message = error instanceof Error ? error.message : "Export failed.";
    await logseq.UI.showMsg(message, "error");
  }
}

function exportButtonTemplate(className: string): string {
  return `<a class="button ${className}" data-on-click="exportCurrentPage" title="${COMMAND_LABEL}"><i class="ti ti-file-export"></i></a>`;
}

function shortcutBinding(settings: EntryPointSettings): string | undefined {
  if (!settings.enableShortcut) return undefined;
  return settings.shortcutBinding || undefined;
}

function paletteCommandShouldRun(settings: EntryPointSettings): boolean {
  return settings.enableCommandPalette || Boolean(shortcutBinding(settings));
}

function applyToolbarVisibility(enabled: boolean): void {
  if (!toolbarRegistered) {
    if (!enabled) return;
    logseq.App.registerUIItem("toolbar", {
      key: TOOLBAR_KEY,
      template: exportButtonTemplate(TOOLBAR_BTN_CLASS),
    });
    toolbarRegistered = true;
  }

  logseq.provideStyle({
    key: TOOLBAR_STYLE_KEY,
    style: enabled
      ? `.${TOOLBAR_BTN_CLASS} { display: flex; }`
      : `.${TOOLBAR_BTN_CLASS} { display: none !important; }`,
  });
}

function renderPageHeader(enabled: boolean): void {
  if (!pageHeaderSlot) return;
  logseq.provideUI({
    key: PAGE_HEADER_UI_KEY,
    slot: pageHeaderSlot,
    reset: true,
    template: enabled ? exportButtonTemplate(PAGE_HEADER_BTN_CLASS) : "",
  });
}

function installPageHeaderHook(): void {
  if (pageHeaderHookInstalled) return;
  pageHeaderHookInstalled = true;
  logseq.App.onPageHeadActionsSlotted(({ slot }) => {
    pageHeaderSlot = slot;
    renderPageHeader(readEntryPointSettings().enablePageHeader);
  });
}

function registerPalette(settings: EntryPointSettings): void {
  if (registered.has("palette")) return;
  if (!paletteCommandShouldRun(settings)) return;

  const binding = shortcutBinding(settings);
  logseq.App.registerCommandPalette(
    {
      key: PALETTE_KEY,
      label: COMMAND_LABEL,
      ...(binding ? { keybinding: { binding, mode: "global" as const } } : {}),
    },
    () => {
      if (!paletteCommandShouldRun(readEntryPointSettings())) return;
      void exportPage();
    },
  );
  registered.add("palette");
}

function registerSlash(): void {
  if (registered.has("slash")) return;
  logseq.Editor.registerSlashCommand(COMMAND_LABEL, async () => {
    if (!readEntryPointSettings().enableSlashCommand) return;
    await exportPage();
  });
  registered.add("slash");
}

function registerPageMenu(): void {
  if (registered.has("pageMenu")) return;
  logseq.App.registerPageMenuItem(COMMAND_LABEL, ({ page }) => {
    if (!readEntryPointSettings().enablePageMenu) return;
    void exportPage(page);
  });
  registered.add("pageMenu");
}

function needsPluginReload(previous: EntryPointSettings, next: EntryPointSettings): boolean {
  if (
    registered.has("palette") &&
    previous.enableCommandPalette &&
    !next.enableCommandPalette &&
    !shortcutBinding(next)
  ) {
    return true;
  }
  if (registered.has("slash") && previous.enableSlashCommand && !next.enableSlashCommand) {
    return true;
  }
  if (registered.has("pageMenu") && previous.enablePageMenu && !next.enablePageMenu) {
    return true;
  }
  if (registered.has("palette")) {
    const prevBind = previous.enableShortcut ? previous.shortcutBinding : "";
    const nextBind = next.enableShortcut ? next.shortcutBinding : "";
    if (prevBind !== nextBind) return true;
  }
  return false;
}

function applyEntryPoints(next: EntryPointSettings, previous?: EntryPointSettings): void {
  applyToolbarVisibility(next.enableToolbar);
  installPageHeaderHook();
  renderPageHeader(next.enablePageHeader);

  const reload = previous ? needsPluginReload(previous, next) : false;

  registerPalette(next);
  if (next.enableSlashCommand) registerSlash();
  if (next.enablePageMenu) registerPageMenu();

  if (reload) {
    void logseq.UI.showMsg(RELOAD_HINT, "warning");
  }
}

async function main(): Promise<void> {
  logseq.useSettingsSchema(settingsSchema);

  logseq.provideModel({
    exportCurrentPage() {
      void exportPage();
    },
  });

  applyEntryPoints(readEntryPointSettings());

  logseq.onSettingsChanged((next, prev) => {
    applyEntryPoints(
      parseEntryPointSettings((next ?? {}) as Record<string, unknown>),
      parseEntryPointSettings((prev ?? {}) as Record<string, unknown>),
    );
  });
}

logseq.ready(main).catch(console.error);
