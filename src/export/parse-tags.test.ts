import { describe, expect, it } from "vitest";
import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";
import {
  extractTagsFromBlock,
  normalizeTag,
  parseTagList,
  blockHasTag,
} from "./parse-tags";

function block(content: string, properties?: Record<string, unknown>): BlockEntity {
  return {
    id: 1,
    uuid: "b1",
    content,
    properties,
  } as BlockEntity;
}

describe("normalizeTag / parseTagList", () => {
  it("strips hash and lowercases", () => {
    expect(normalizeTag("#Decision")).toBe("decision");
    expect(parseTagList("Decision, #meeting, DECISION")).toEqual(["decision", "meeting"]);
  });

  it("returns empty for blank input", () => {
    expect(parseTagList("  ")).toEqual([]);
  });
});

describe("extractTagsFromBlock", () => {
  it("finds hash tags and wiki links", () => {
    const tags = extractTagsFromBlock(block("Note #Decision about [[Meeting]]"));
    expect(tags.has("decision")).toBe(true);
    expect(tags.has("meeting")).toBe(true);
  });

  it("reads tags property arrays", () => {
    const tags = extractTagsFromBlock(
      block("plain", { tags: ["Archive", "#spam"] }),
    );
    expect(tags.has("archive")).toBe(true);
    expect(tags.has("spam")).toBe(true);
  });

  it("supports blockHasTag", () => {
    expect(blockHasTag(block("x #Foo"), "foo")).toBe(true);
    expect(blockHasTag(block("x #Foo"), "bar")).toBe(false);
  });
});
