import { collectExport } from "./export/collect";
import { downloadBlob } from "./export/download";
import { countRefBlocks } from "./export/filter-refs";
import { renderExport } from "./export/render";
import { filtersAreActive, formatLabel } from "./export/types";
import { readExportSettings } from "./settings";

const PLUGIN_VERSION = "0.2.1";

export async function exportCurrentPageWithLinkedReferences(): Promise<void> {
  const current = await logseq.Editor.getCurrentPage();
  if (!current) {
    await logseq.UI.showMsg("Open a page before exporting.", "warning");
    return;
  }

  try {
    const settings = readExportSettings();
    const identity = current.uuid ?? current.name;
    const bundle = await collectExport(identity, {
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
