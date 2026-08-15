import "@logseq/libs";
import { collectExport } from "./export/collect";
import { downloadTextFile } from "./export/download";
import { countRefBlocks } from "./export/filter-refs";
import { exportFilename, serializeExport } from "./export/serialize-md";
import { filtersAreActive } from "./export/types";
import { readExportSettings, settingsSchema } from "./settings";

async function exportCurrentPageWithLinkedReferences(): Promise<void> {
  const current = await logseq.Editor.getCurrentPage();
  if (!current) {
    await logseq.UI.showMsg("Open a page before exporting.", "warning");
    return;
  }

  try {
    const settings = readExportSettings();
    if (settings.defaultFormat === "zip") {
      await logseq.UI.showMsg(
        "ZIP export is not available yet — downloading Markdown instead.",
        "info",
      );
    }

    const identity = current.uuid ?? current.name;
    const bundle = await collectExport(identity, {
      includeParentPath: settings.includeParentPath,
      filters: settings.filters,
    });
    const markdown = serializeExport(bundle, {
      includeParentPath: settings.includeParentPath,
      linkStyle: settings.linkStyle,
      headingForRefs: settings.headingForRefs,
    });

    downloadTextFile(exportFilename(bundle.page, bundle.appliedFilters), markdown);

    const refCount = countRefBlocks(bundle.linkedRefs);
    const before = bundle.linkedRefCountBeforeFilter ?? refCount;
    const filtered = filtersAreActive(settings.filters);
    const title = bundle.page.originalName || bundle.page.name;
    const message = filtered
      ? `Exported “${title}” with ${refCount} linked reference block(s) (filtered from ${before}).`
      : `Exported “${title}” with ${refCount} linked reference block(s).`;
    await logseq.UI.showMsg(message, "success");
  } catch (error) {
    console.error("[logseq-export]", error);
    const message = error instanceof Error ? error.message : "Export failed.";
    await logseq.UI.showMsg(message, "error");
  }
}

async function main(): Promise<void> {
  logseq.useSettingsSchema(settingsSchema);

  logseq.App.registerCommandPalette(
    {
      key: "export-page-with-linked-references",
      label: "Export page with linked references",
    },
    () => {
      void exportCurrentPageWithLinkedReferences();
    },
  );

  logseq.Editor.registerSlashCommand("Export page with linked references", async () => {
    await exportCurrentPageWithLinkedReferences();
  });
}

logseq.ready(main).catch(console.error);
