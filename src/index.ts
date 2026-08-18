import "@logseq/libs";
import { settingsSchema } from "./settings";

/**
 * Keep the startup path tiny: register commands immediately, then lazy-load
 * the export implementation on first use. Logseq aborts plugins that take
 * too long to call ready() / finish initial evaluation.
 */
async function runExport(): Promise<void> {
  const { exportCurrentPageWithLinkedReferences } = await import("./export-flow");
  await exportCurrentPageWithLinkedReferences();
}

function main(): void {
  logseq.useSettingsSchema(settingsSchema);

  logseq.App.registerCommandPalette(
    {
      key: "export-page-with-linked-references",
      label: "Export page with linked references",
    },
    () => {
      void runExport();
    },
  );

  logseq.Editor.registerSlashCommand("Export page with linked references", async () => {
    await runExport();
  });
}

logseq.ready(main).catch(console.error);
