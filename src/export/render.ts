import { packageMarkdownZip } from "./package-zip";
import { serializeHtml } from "./serialize-html";
import { exportFilename, serializeExport } from "./serialize-md";
import { serializePlain } from "./serialize-plain";
import type {
  ExportBundle,
  ExportFormat,
  RenderedExport,
  SerializeOptions,
} from "./types";

export interface RenderOptions extends SerializeOptions {
  format: ExportFormat;
  pluginVersion?: string;
}

export async function renderExport(
  bundle: ExportBundle,
  options: RenderOptions,
): Promise<RenderedExport> {
  const filename = exportFilename(
    bundle.page,
    bundle.appliedFilters,
    options.format,
  );

  switch (options.format) {
    case "markdown": {
      const text = serializeExport(bundle, options);
      return {
        filename,
        mime: "text/markdown",
        blob: new Blob([text], { type: "text/markdown;charset=utf-8" }),
      };
    }
    case "html": {
      const text = serializeHtml(bundle, options);
      return {
        filename,
        mime: "text/html",
        blob: new Blob([text], { type: "text/html;charset=utf-8" }),
      };
    }
    case "plain": {
      // Prefer plain wiki-link rewriting for .txt unless user set keep/bold explicitly —
      // we honor the user's linkStyle from settings as-is.
      const text = serializePlain(bundle, options);
      return {
        filename,
        mime: "text/plain",
        blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
      };
    }
    case "markdown-zip": {
      const blob = await packageMarkdownZip(bundle, options, options.pluginVersion);
      return {
        filename,
        mime: "application/zip",
        blob,
      };
    }
    default: {
      const _exhaustive: never = options.format;
      throw new Error(`Unsupported export format: ${String(_exhaustive)}`);
    }
  }
}
