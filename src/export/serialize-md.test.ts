import { describe, expect, it } from "vitest";
import type { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin.user";
import {
  blocksToMarkdown,
  exportFilename,
  rewriteLinks,
  sanitizeFilename,
  serializeExport,
  withoutDuplicatedPageProperties,
} from "./serialize-md";
import type { ExportBundle } from "./types";
import { emptyFilters } from "./types";

function page(partial: Partial<PageEntity> & Pick<PageEntity, "name">): PageEntity {
  return {
    id: 1,
    uuid: "page-uuid",
    ...partial,
  } as PageEntity;
}

function block(
  content: string,
  children: BlockEntity[] = [],
  extras: Partial<BlockEntity> = {},
): BlockEntity {
  return {
    id: Math.random(),
    uuid: `b-${content.slice(0, 8)}-${Math.random()}`,
    content,
    children,
    ...extras,
  } as BlockEntity;
}

describe("rewriteLinks", () => {
  it("keeps wiki links by default", () => {
    expect(rewriteLinks("See [[Alpha]] and [[Beta]]", "keep")).toBe(
      "See [[Alpha]] and [[Beta]]",
    );
  });

  it("bolds wiki link labels", () => {
    expect(rewriteLinks("See [[Alpha]]", "bold")).toBe("See **Alpha**");
  });

  it("strips wiki link brackets", () => {
    expect(rewriteLinks("See [[Alpha/Beta]]", "plain")).toBe("See Alpha/Beta");
  });
});

describe("sanitizeFilename", () => {
  it("replaces path and reserved characters", () => {
    expect(sanitizeFilename('a/b:c*d?"e<f>|g')).toBe("a_b_c_d__e_f__g");
  });

  it("falls back when empty", () => {
    expect(sanitizeFilename("   ")).toBe("export");
  });
});

describe("blocksToMarkdown", () => {
  it("renders nested lists", () => {
    const tree = [block("parent", [block("child")])];
    expect(blocksToMarkdown(tree, "keep")).toEqual(["- parent", "  - child"]);
  });

  it("indents continuation lines of a multi-line block under the same bullet", () => {
    expect(blocksToMarkdown([block("first\nsecond\nthird")], "keep")).toEqual([
      "- first",
      "  second",
      "  third",
    ]);
  });

  it("keeps nested children under a multi-line parent", () => {
    const tree = [block("parent\nmore", [block("child\nalso")])];
    expect(blocksToMarkdown(tree, "keep")).toEqual([
      "- parent",
      "  more",
      "  - child",
      "    also",
    ]);
  });
});

describe("withoutDuplicatedPageProperties", () => {
  it("drops a leading properties-only block when page.properties is present", () => {
    const propsBlock = block("salesperson:: Brian\npresales-lead:: Ajay");
    const heading = block("# Intro");
    expect(
      withoutDuplicatedPageProperties([propsBlock, heading], {
        salesperson: "Brian",
        presalesLead: "Ajay",
      }),
    ).toEqual([heading]);
  });

  it("strips property lines from a mixed first block", () => {
    const mixed = block("status:: active\n# Intro");
    const [kept] = withoutDuplicatedPageProperties([mixed], { status: "active" });
    expect(kept.content).toBe("# Intro");
  });

  it("keeps the properties block when page.properties is empty", () => {
    const propsBlock = block("status:: active");
    expect(withoutDuplicatedPageProperties([propsBlock], undefined)).toEqual([
      propsBlock,
    ]);
  });
});

describe("serializeExport", () => {
  it("includes page body and grouped linked references", () => {
    const bundle: ExportBundle = {
      page: page({
        name: "project alpha",
        originalName: "Project Alpha",
        properties: { status: "active" },
      }),
      body: [block("Goal: ship export", [block("Detail [[Other]]")])],
      linkedRefs: [
        {
          page: page({ name: "journal", originalName: "Aug 15th, 2026" }),
          blocks: [block("Working on [[Project Alpha]]")],
        },
      ],
    };

    const md = serializeExport(bundle, {
      includeParentPath: true,
      linkStyle: "keep",
      headingForRefs: "Linked References",
    });

    expect(md).toContain("# Project Alpha");
    expect(md).toContain("status:: active");
    expect(md).toContain("- Goal: ship export");
    expect(md).toContain("  - Detail [[Other]]");
    expect(md).toContain("## Linked References");
    expect(md).toContain("### From [[Aug 15th, 2026]]");
    expect(md).toContain("- Working on [[Project Alpha]]");
  });

  it("notes when there are no linked references", () => {
    const bundle: ExportBundle = {
      page: page({ name: "lonely", originalName: "Lonely" }),
      body: [block("solo")],
      linkedRefs: [],
    };

    const md = serializeExport(bundle, {
      includeParentPath: false,
      linkStyle: "plain",
      headingForRefs: "Backlinks",
    });

    expect(md).toContain("## Backlinks");
    expect(md).toContain("_No linked references._");
  });

  it("documents applied filters and empty filtered state", () => {
    const bundle: ExportBundle = {
      page: page({ name: "filtered", originalName: "Filtered" }),
      body: [block("body")],
      linkedRefs: [],
      appliedFilters: {
        ...emptyFilters(),
        includeTags: ["decision"],
        dateFrom: "2026-01-01",
        dateTo: "2026-03-31",
      },
    };

    const md = serializeExport(bundle, {
      includeParentPath: false,
      linkStyle: "keep",
      headingForRefs: "Linked References",
    });

    expect(md).toContain("_Filters: tags include decision (any); from 2026-01-01 to 2026-03-31_");
    expect(md).toContain("_No linked references matched the current filters._");
  });

  it("builds a safe download filename", () => {
    expect(exportFilename(page({ name: "a/b", originalName: "A/B" }))).toBe(
      "A_B-with-linked-references.md",
    );
    expect(
      exportFilename(page({ name: "a/b", originalName: "A/B" }), {
        ...emptyFilters(),
        includeTags: ["x"],
      }),
    ).toBe("A_B-with-linked-references-filtered.md");
    expect(
      exportFilename(page({ name: "a/b", originalName: "A/B" }), emptyFilters(), "html"),
    ).toBe("A_B-with-linked-references.html");
  });
});
