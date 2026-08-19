import { describe, expect, it } from "vitest";
import type { BlockEntity, PageEntity } from "@logseq/libs/dist/LSPlugin.user";
import {
  linkedRefRoots,
  pageJournalDay,
  parentRef,
  sortLinkedRefGroups,
} from "./collect";
import type { LinkedRefGroup } from "./types";

function page(partial: Partial<PageEntity> & Pick<PageEntity, "name">): PageEntity {
  return { id: 1, uuid: "page-uuid", ...partial } as PageEntity;
}

function block(
  content: string,
  extras: Omit<Partial<BlockEntity>, "parent"> & { parent?: unknown } = {},
): BlockEntity {
  return {
    id: extras.id ?? 1,
    uuid: extras.uuid ?? `b-${content}`,
    content,
    ...extras,
  } as BlockEntity;
}

describe("parentRef", () => {
  it("reads numeric ids, uuid strings, and {id}/{uuid} objects", () => {
    expect(parentRef(block("x", { parent: 42 }))).toBe(42);
    expect(parentRef(block("x", { parent: { id: 7 } }))).toBe(7);
    expect(parentRef(block("x", { parent: { uuid: "abc" } }))).toBe("abc");
    expect(parentRef(block("x", { parent: "uuid-1" }))).toBe("uuid-1");
    expect(parentRef(block("x"))).toBeNull();
  });
});

describe("linkedRefRoots", () => {
  it("drops descendants that the linked-refs API returned as siblings", () => {
    const match = block("[[sample page]] second meeting", { id: 2, uuid: "match" });
    const line1 = block("line 1: this should appear in the right order", {
      id: 3,
      uuid: "line1",
      parent: { id: 2 },
    });
    const line2 = block("line 2: let's see if it does", {
      id: 4,
      uuid: "line2",
      parent: { id: 2 },
    });

    expect(linkedRefRoots([line2, line1, match])).toEqual([match]);
  });

  it("keeps multiple independent hits on the same page", () => {
    const first = block("[[sample page]] a", { id: 2, uuid: "a", parent: { id: 1 } });
    const second = block("[[sample page]] b", { id: 3, uuid: "b", parent: { id: 1 } });
    expect(linkedRefRoots([second, first]).map((b) => b.uuid)).toEqual(["b", "a"]);
  });
});

describe("pageJournalDay", () => {
  it("prefers journalDay then the journal title", () => {
    expect(
      pageJournalDay(
        page({
          name: "aug 18th, 2026",
          originalName: "Aug 18th, 2026",
          journalDay: 20260818,
        } as Partial<PageEntity> & { name: string; journalDay: number }),
      ),
    ).toBe("2026-08-18");
    expect(pageJournalDay(page({ name: "scratch", originalName: "Scratch" }))).toBeNull();
    expect(pageJournalDay(page({ name: "aug 17th, 2026", originalName: "Aug 17th, 2026" }))).toBe(
      "2026-08-17",
    );
  });
});

describe("sortLinkedRefGroups", () => {
  const groups: LinkedRefGroup[] = [
    {
      page: page({ name: "aug 17th, 2026", originalName: "Aug 17th, 2026", journalDay: 20260817 }),
      blocks: [block("older")],
    },
    {
      page: page({ name: "scratch", originalName: "Scratch" }),
      blocks: [block("note")],
    },
    {
      page: page({ name: "aug 18th, 2026", originalName: "Aug 18th, 2026", journalDay: 20260818 }),
      blocks: [block("newer")],
    },
  ];

  it("orders journals newest-first by default, then other pages by name", () => {
    expect(sortLinkedRefGroups(groups).map((g) => g.page.originalName)).toEqual([
      "Aug 18th, 2026",
      "Aug 17th, 2026",
      "Scratch",
    ]);
  });

  it("orders journals oldest-first when requested", () => {
    expect(sortLinkedRefGroups(groups, "oldest-first").map((g) => g.page.originalName)).toEqual([
      "Aug 17th, 2026",
      "Aug 18th, 2026",
      "Scratch",
    ]);
  });

  it("orders all source pages alphabetically when requested", () => {
    expect(sortLinkedRefGroups(groups, "alphabetical").map((g) => g.page.originalName)).toEqual([
      "Aug 17th, 2026",
      "Aug 18th, 2026",
      "Scratch",
    ]);
  });
});
