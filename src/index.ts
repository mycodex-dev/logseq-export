import "@logseq/libs";
import { collectExport } from "./export/collect";
import { downloadTextFile } from "./export/download";
import { exportFilename, serializeExport } from "./export/serialize-md";
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
    });
    const markdown = serializeExport(bundle, {
      includeParentPath: settings.includeParentPath,
      linkStyle: settings.linkStyle,
      headingForRefs: settings.headingForRefs,
    });

    downloadTextFile(exportFilename(bundle.page), markdown);
    const refCount = bundle.linkedRefs.reduce((sum, group) => sum + group.blocks.length, 0);
    await logseq.UI.showMsg(
      `Exported “${bundle.page.originalName || bundle.page.name}” with ${refCount} linked reference block(s).`,
      "success",
    );
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
