import { describe, expect, it } from "vitest";
import type { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin.user";
import {
  countRefBlocks,
  describeFilters,
  filterLinkedRefs,
  effectiveDate,
} from "./filter-refs";
import type { FilterOptions, LinkedRefGroup } from "./types";
import { emptyFilters } from "./types";

function page(partial: Partial<PageEntity> & Pick<PageEntity, "name">): PageEntity {
  return { id: 1, uuid: "p", ...partial } as PageEntity;
}

function block(content: string, extras: Partial<BlockEntity> = {}): BlockEntity {
  return { id: 1, uuid: `b-${content}`, content, ...extras } as BlockEntity;
}

function filters(partial: Partial<FilterOptions>): FilterOptions {
  return { ...emptyFilters(), ...partial };
}

describe("effectiveDate", () => {
  it("prefers journalDay", () => {
    const p = page({ name: "aug 15th, 2026", journalDay: 20260815, journal: true } as Partial<PageEntity> & {
      name: string;
      journalDay: number;
      journal: boolean;
    });
    expect(effectiveDate(p, block("mention"))).toBe("2026-08-15");
  });
});

describe("filterLinkedRefs", () => {
  const groups: LinkedRefGroup[] = [
    {
      page: page({
        name: "aug 15th, 2026",
        originalName: "Aug 15th, 2026",
        journalDay: 20260815,
        journal: true,
      } as Partial<PageEntity> & { name: string; journalDay: number; journal: boolean }),
      blocks: [
        block("Working on it #decision"),
        block("Old note #archive"),
        block("Meeting notes #meeting #decision"),
      ],
    },
    {
      page: page({
        name: "jan 1st, 2025",
        originalName: "Jan 1st, 2025",
        journalDay: 20250101,
        journal: true,
      } as Partial<PageEntity> & { name: string; journalDay: number; journal: boolean }),
      blocks: [block("Ancient #decision")],
    },
    {
      page: page({ name: "scratch", originalName: "Scratch" }),
      blocks: [block("No date #decision")],
    },
  ];

  it("returns all groups when filters are inactive", () => {
    expect(filterLinkedRefs(groups, emptyFilters())).toHaveLength(3);
    expect(countRefBlocks(filterLinkedRefs(groups, emptyFilters()))).toBe(5);
  });

  it("filters by include tag (any)", () => {
    const result = filterLinkedRefs(
      groups,
      filters({ includeTags: ["meeting"] }),
    );
    expect(countRefBlocks(result)).toBe(1);
    expect(result[0]?.blocks[0]?.content).toContain("#meeting");
  });

  it("filters by include tag (all)", () => {
    const result = filterLinkedRefs(
      groups,
      filters({ includeTags: ["meeting", "decision"], tagMatch: "all" }),
    );
    expect(countRefBlocks(result)).toBe(1);
  });

  it("applies exclude after include", () => {
    const result = filterLinkedRefs(
      groups,
      filters({ includeTags: ["decision"], excludeTags: ["archive"] }),
    );
    const contents = result.flatMap((g) => g.blocks.map((b) => b.content));
    expect(contents.some((c) => c.includes("#archive"))).toBe(false);
    expect(contents.some((c) => c.includes("#decision"))).toBe(true);
  });

  it("filters by date range using journalDay", () => {
    const result = filterLinkedRefs(
      groups,
      filters({ dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
    );
    // Aug 2026 journal (3 blocks) + undated scratch kept by default
    expect(countRefBlocks(result)).toBe(4);
    expect(result.some((g) => g.page.name === "jan 1st, 2025")).toBe(false);
  });

  it("drops undated when configured", () => {
    const result = filterLinkedRefs(
      groups,
      filters({ dateFrom: "2026-01-01", dropUndatedRefs: true }),
    );
    expect(result.some((g) => g.page.name === "scratch")).toBe(false);
    expect(countRefBlocks(result)).toBe(3);
  });

  it("combines tags and dates with AND", () => {
    const result = filterLinkedRefs(
      groups,
      filters({
        includeTags: ["decision"],
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
        dropUndatedRefs: true,
      }),
    );
    expect(countRefBlocks(result)).toBe(2); // decision + meeting/decision on Aug page
  });

  it("describes active filters", () => {
    const text = describeFilters(
      filters({
        includeTags: ["decision"],
        dateFrom: "2026-01-01",
        dateTo: "2026-03-31",
      }),
    );
    expect(text).toContain("tags include decision");
    expect(text).toContain("from 2026-01-01 to 2026-03-31");
  });
});
