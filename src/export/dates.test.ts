import { describe, expect, it } from "vitest";
import {
  inDateRange,
  journalDayToIso,
  parseIsoDate,
  parseJournalTitle,
  timestampToLocalIso,
  dateRangeIsValid,
} from "./dates";

describe("parseIsoDate", () => {
  it("accepts valid dates", () => {
    expect(parseIsoDate("2026-08-15")).toBe("2026-08-15");
    expect(parseIsoDate(" 2026-01-01 ")).toBe("2026-01-01");
  });

  it("rejects invalid values", () => {
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-02-31")).toBeNull();
    expect(parseIsoDate("08/15/2026")).toBeNull();
  });
});

describe("journalDayToIso", () => {
  it("converts Logseq journalDay numbers", () => {
    expect(journalDayToIso(20260815)).toBe("2026-08-15");
    expect(journalDayToIso("20260101")).toBe("2026-01-01");
  });

  it("rejects malformed values", () => {
    expect(journalDayToIso(2026)).toBeNull();
    expect(journalDayToIso(null)).toBeNull();
  });
});

describe("parseJournalTitle", () => {
  it("parses Logseq English journal titles", () => {
    expect(parseJournalTitle("Aug 18th, 2026")).toBe("2026-08-18");
    expect(parseJournalTitle("Aug 17th, 2026")).toBe("2026-08-17");
    expect(parseJournalTitle("January 1st, 2025")).toBe("2025-01-01");
    expect(parseJournalTitle("Mar 2nd, 2026")).toBe("2026-03-02");
  });

  it("accepts ISO titles and rejects non-dates", () => {
    expect(parseJournalTitle("2026-08-18")).toBe("2026-08-18");
    expect(parseJournalTitle("sample page")).toBeNull();
    expect(parseJournalTitle("Feb 31st, 2026")).toBeNull();
  });
});

describe("timestampToLocalIso", () => {
  it("formats a known UTC noon timestamp to a local calendar day", () => {
    const ms = Date.UTC(2026, 7, 15, 12, 0, 0);
    const iso = timestampToLocalIso(ms);
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("inDateRange", () => {
  it("keeps everything when no bounds", () => {
    expect(inDateRange("2026-01-01", null, null, false)).toBe(true);
    expect(inDateRange(null, null, null, true)).toBe(true);
  });

  it("applies inclusive bounds", () => {
    expect(inDateRange("2026-01-01", "2026-01-01", "2026-03-31", false)).toBe(true);
    expect(inDateRange("2026-03-31", "2026-01-01", "2026-03-31", false)).toBe(true);
    expect(inDateRange("2025-12-31", "2026-01-01", "2026-03-31", false)).toBe(false);
    expect(inDateRange("2026-04-01", "2026-01-01", "2026-03-31", false)).toBe(false);
  });

  it("handles open-ended ranges", () => {
    expect(inDateRange("2026-08-01", "2026-08-01", null, false)).toBe(true);
    expect(inDateRange("2026-07-31", "2026-08-01", null, false)).toBe(false);
    expect(inDateRange("2025-12-31", null, "2025-12-31", false)).toBe(true);
  });

  it("respects dropUndated", () => {
    expect(inDateRange(null, "2026-01-01", null, false)).toBe(true);
    expect(inDateRange(null, "2026-01-01", null, true)).toBe(false);
  });
});

describe("dateRangeIsValid", () => {
  it("requires from <= to when both set", () => {
    expect(dateRangeIsValid("2026-01-01", "2026-02-01")).toBe(true);
    expect(dateRangeIsValid("2026-02-01", "2026-01-01")).toBe(false);
    expect(dateRangeIsValid("2026-01-01", null)).toBe(true);
  });
});
