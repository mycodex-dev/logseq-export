export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** @deprecated Prefer downloadBlob via renderExport */
export function downloadTextFile(filename: string, content: string, mime = "text/markdown"): void {
  downloadBlob(filename, new Blob([content], { type: `${mime};charset=utf-8` }));
}
