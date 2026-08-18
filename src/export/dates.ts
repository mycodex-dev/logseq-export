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
