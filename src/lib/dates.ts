/**
 * Date & period helpers.
 *
 * Storage convention: an expense's `date` is a *calendar day*, stored as
 * 00:00:00.000 UTC of that day (e.g. "2026-10-31" -> 2026-10-31T00:00:00.000Z).
 * Every range query and every display of an expense date therefore works in UTC,
 * which guarantees an expense always lands in the calendar month the user picked,
 * no matter which timezone the server or the browser is in.
 *
 * "Today" / "current month" are resolved in the app timezone
 * (NEXT_PUBLIC_APP_TIMEZONE, default Asia/Karachi).
 */

export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Karachi";

export type Period =
  | { kind: "month"; year: number; month: number } // month is 1-12
  | { kind: "all" };

const DATE_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Today's calendar date in the app timezone, as "YYYY-MM-DD". */
export function todayInput(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Today's calendar date in the app timezone, as a UTC-midnight Date. */
export function todayUTC(now: Date = new Date()): Date {
  return dateInputToUTC(todayInput(now));
}

export function currentYearMonth(now: Date = new Date()) {
  const [y, m] = todayInput(now).split("-").map(Number);
  return { year: y, month: m };
}

export function isValidDateInput(value: string): boolean {
  const match = DATE_INPUT_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

/** "2026-10-31" -> 2026-10-31T00:00:00.000Z */
export function dateInputToUTC(value: string): Date {
  const match = DATE_INPUT_RE.exec(value);
  if (!match) throw new Error(`Invalid date input: ${value}`);
  const [, y, m, d] = match.map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** UTC-midnight Date (or ISO string) -> "YYYY-MM-DD" */
export function toDateInput(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

/** Convert a "YYYY-MM-DD" string into a *local* Date (for UI date pickers). */
export function dateInputToLocal(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Convert a local Date (from a UI date picker) into "YYYY-MM-DD". */
export function localToDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** [start, end) range covering the whole calendar month. */
export function monthRange(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

/** [start, end) range covering the whole calendar year. */
export function yearRange(year: number) {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function diffInDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/* ------------------------------------------------------------------ */
/* Period (month/year/all) <-> URL search param                        */
/* ------------------------------------------------------------------ */

export const ALL_TIME_PARAM = "all";

/** Parse the `period` search param. Defaults to the current month. */
export function parsePeriod(value: string | string[] | undefined | null): Period {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === ALL_TIME_PARAM) return { kind: "all" };
  const match = raw ? PERIOD_RE.exec(raw) : null;
  if (match) {
    const year = Number(match[1]);
    if (year >= 1970 && year <= 2200) return { kind: "month", year, month: Number(match[2]) };
  }
  return { kind: "month", ...currentYearMonth() };
}

export function periodToParam(period: Period): string {
  if (period.kind === "all") return ALL_TIME_PARAM;
  return `${period.year}-${String(period.month).padStart(2, "0")}`;
}

export function isCurrentMonth(period: Period): boolean {
  if (period.kind !== "month") return false;
  const now = currentYearMonth();
  return now.year === period.year && now.month === period.month;
}

/** Date range for a period, or `undefined` for all-time. */
export function periodRange(period: Period) {
  return period.kind === "month" ? monthRange(period.year, period.month) : undefined;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthLabel(year: number, month: number, short = false): string {
  const name = MONTH_NAMES[month - 1];
  return `${short ? name.slice(0, 3) : name} ${year}`;
}

export function periodLabel(period: Period, short = false): string {
  return period.kind === "all" ? "All time" : monthLabel(period.year, period.month, short);
}

/** Format an expense calendar date (UTC-midnight) e.g. "31 Oct 2026". */
export function formatExpenseDate(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(d);
}

/** Format a real timestamp (createdAt / updatedAt) in the app timezone. */
export function formatTimestamp(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: APP_TIMEZONE,
  }).format(d);
}
