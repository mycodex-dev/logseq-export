/** YYYY-MM-DD calendar date helpers (local date semantics, no time-of-day). */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = ISO_DATE_RE.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Validate via Date.UTC to catch impossible days (e.g. Feb 31)
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Logseq journalDay is often a number like 20260815. */
export function journalDayToIso(journalDay: number | string | undefined | null): string | null {
  if (journalDay == null || journalDay === "") return null;
  const raw = String(journalDay).replace(/\D/g, "");
  if (raw.length !== 8) return null;
  return parseIsoDate(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`);
}

const MONTH_INDEX: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const JOURNAL_TITLE_RE =
  /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i;

/**
 * Parse a Logseq journal title such as "Aug 18th, 2026" or an ISO date.
 * Returns YYYY-MM-DD, or null when the title is not a journal date.
 */
export function parseJournalTitle(title: string | null | undefined): string | null {
  if (title == null) return null;
  const trimmed = title.trim();
  if (!trimmed) return null;

  const iso = parseIsoDate(trimmed);
  if (iso) return iso;

  const match = JOURNAL_TITLE_RE.exec(trimmed);
  if (!match) return null;
  const month = MONTH_INDEX[match[1].toLowerCase()];
  if (!month) return null;
  return parseIsoDate(`${match[3]}-${month}-${match[2].padStart(2, "0")}`);
}

export function timestampToLocalIso(ms: number | undefined | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function inDateRange(
  day: string | null,
  from: string | null,
  to: string | null,
  dropUndated: boolean,
): boolean {
  if (from == null && to == null) return true;
  if (day == null) return !dropUndated;
  if (from != null && day < from) return false;
  if (to != null && day > to) return false;
  return true;
}

export function dateRangeIsValid(from: string | null, to: string | null): boolean {
  if (from != null && to != null) return from <= to;
  return true;
}
