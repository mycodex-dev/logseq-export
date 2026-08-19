import { describe, expect, it } from "vitest";
import type { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin.user";
import JSZip from "jszip";
import { packageMarkdownZip, buildZipMeta } from "./package-zip";
import { renderExport } from "./render";
import { escapeHtml, serializeHtml } from "./serialize-html";
import { serializePlain } from "./serialize-plain";
import type { ExportBundle } from "./types";
import { emptyFilters } from "./types";

function page(partial: Partial<PageEntity> & Pick<PageEntity, "name">): PageEntity {
  return { id: 1, uuid: "page-uuid", ...partial } as PageEntity;
}

function block(content: string, children: BlockEntity[] = []): BlockEntity {
  return {
    id: 1,
    uuid: `b-${content}`,
    content,
    children,
  } as BlockEntity;
}

function sampleBundle(filters = false): ExportBundle {
  return {
    page: page({
      name: "project alpha",
      originalName: "Project Alpha",
      properties: { status: "active" },
    }),
    body: [block("Goal: ship <formats>", [block("Detail [[Other]]")])],
    linkedRefs: [
      {
        page: page({ name: "journal", originalName: "Aug 15th, 2026" }),
        blocks: [block("Working on [[Project Alpha]] #decision")],
      },
    ],
    appliedFilters: filters
      ? { ...emptyFilters(), includeTags: ["decision"], dateFrom: "2026-01-01" }
      : emptyFilters(),
    linkedRefCountBeforeFilter: 3,
  };
}

const baseOptions = {
  includeParentPath: true,
  linkStyle: "keep" as const,
  headingForRefs: "Linked References",
};

describe("escapeHtml", () => {
  it("escapes angle brackets and ampersands", () => {
    expect(escapeHtml(`a <b> & "c"`)).toBe("a &lt;b&gt; &amp; &quot;c&quot;");
  });
});

describe("serializeHtml", () => {
  it("renders a self-contained document with escaped content", () => {
    const html = serializeHtml(sampleBundle(), baseOptions);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<h1>Project Alpha</h1>");
    expect(html).toContain("Goal: ship &lt;formats&gt;");
    expect(html).toContain('id="linked-references"');
    expect(html).toContain("From");
    expect(html).toContain('<a class="wikilink"');
  });

  it("nests linked-ref children under the matching block in given order", () => {
    const bundle: ExportBundle = {
      page: page({ name: "sample page", originalName: "sample page" }),
      body: [block("body")],
      linkedRefs: [
        {
          page: page({ name: "aug 18th, 2026", originalName: "Aug 18th, 2026" }),
          blocks: [
            block("Meetings", [
              block("[[sample page]] second meeting", [
                block("line 1: this should appear in the right order"),
                block("line 2: let's see if it does"),
              ]),
            ]),
          ],
        },
      ],
    };

    const html = serializeHtml(bundle, baseOptions);
    const refs = html.slice(html.indexOf('id="linked-references"'));
    expect(refs.indexOf("Aug 18th, 2026")).toBeGreaterThan(-1);
    expect(refs.indexOf("Meetings")).toBeLessThan(refs.indexOf("second meeting"));
    expect(refs.indexOf("line 1:")).toBeLessThan(refs.indexOf("line 2:"));
    expect(refs.indexOf("second meeting")).toBeLessThan(refs.indexOf("line 1:"));
  });

  it("includes filter provenance", () => {
    const html = serializeHtml(sampleBundle(true), baseOptions);
    expect(html).toContain("Filters:");
    expect(html).toContain("decision");
  });
});

describe("serializePlain", () => {
  it("renders plain text without HTML tags", () => {
    const text = serializePlain(sampleBundle(), {
      ...baseOptions,
      linkStyle: "plain",
    });
    expect(text).toContain("Project Alpha");
    expect(text).toContain("- Goal: ship <formats>");
    expect(text).toContain("From: Aug 15th, 2026");
    expect(text).not.toContain("<h1>");
    expect(text).toContain("- Detail Other");
  });
});

describe("packageMarkdownZip", () => {
  it("builds a zip with index, refs, and meta", async () => {
    const blob = await packageMarkdownZip(sampleBundle(true), baseOptions, "0.2.0");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]?.dir);
    expect(names.some((n) => n.endsWith("index.md"))).toBe(true);
    expect(names.some((n) => n.endsWith("linked-references.md"))).toBe(true);
    expect(names.some((n) => n.endsWith("meta.json"))).toBe(true);

    const metaPath = names.find((n) => n.endsWith("meta.json"));
    const metaRaw = await zip.file(metaPath!)!.async("string");
    const meta = JSON.parse(metaRaw);
    expect(meta.format).toBe("markdown-zip");
    expect(meta.rootPage).toBe("Project Alpha");
    expect(meta.filtersActive).toBe(true);
    expect(meta.version).toBe("0.2.0");
  });

  it("buildZipMeta counts refs", () => {
    const meta = buildZipMeta(sampleBundle(), "0.2.0");
    expect(meta.linkedRefBlockCount).toBe(1);
    expect(meta.refGroupCount).toBe(1);
  });
});

describe("renderExport", () => {
  it("renders markdown blob", async () => {
    const out = await renderExport(sampleBundle(), { ...baseOptions, format: "markdown" });
    expect(out.filename).toBe("Project Alpha-with-linked-references.md");
    expect(out.mime).toBe("text/markdown");
    expect(await out.blob.text()).toContain("# Project Alpha");
  });

  it("renders html and plain with correct extensions", async () => {
    const html = await renderExport(sampleBundle(true), { ...baseOptions, format: "html" });
    expect(html.filename).toBe("Project Alpha-with-linked-references-filtered.html");
    expect(html.mime).toBe("text/html");

    const plain = await renderExport(sampleBundle(), { ...baseOptions, format: "plain" });
    expect(plain.filename).toBe("Project Alpha-with-linked-references.txt");
    expect(plain.mime).toBe("text/plain");
  });

  it("renders zip mime", async () => {
    const out = await renderExport(sampleBundle(), {
      ...baseOptions,
      format: "markdown-zip",
      pluginVersion: "0.2.0",
    });
    expect(out.filename.endsWith(".zip")).toBe(true);
    expect(out.mime).toBe("application/zip");
  });
});
