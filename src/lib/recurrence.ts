/**
 * Due-date math for recurring bills. Dates are calendar days at UTC midnight.
 *
 * Occurrences are counted from the start date instead of from the previous due
 * date, so a bill that starts on the 31st is due on the 31st (or the last day of
 * shorter months) every month, instead of drifting to the 28th after February.
 */

export type FrequencyValue = "WEEKLY" | "MONTHLY" | "YEARLY";

export const FREQUENCY_LABELS: Record<FrequencyValue, { one: string; many: string }> = {
  WEEKLY: { one: "week", many: "weeks" },
  MONTHLY: { one: "month", many: "months" },
  YEARLY: { one: "year", many: "years" },
};

function daysIn(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** The n-th due date (n = 0 is the start date). */
export function occurrence(start: Date, frequency: FrequencyValue, interval: number, n: number): Date {
  const step = Math.max(1, interval) * n;
  if (frequency === "WEEKLY") return new Date(start.getTime() + step * 7 * 86_400_000);
  const months = frequency === "MONTHLY" ? step : step * 12;
  const index = start.getUTCFullYear() * 12 + start.getUTCMonth() + months;
  const year = Math.floor(index / 12);
  const month = index % 12;
  return new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), daysIn(year, month))));
}

/** The first due date strictly after `current`. */
export function nextOccurrence(start: Date, frequency: FrequencyValue, interval: number, current: Date): Date {
  // Estimate n, then step forward until we pass `current` (handles clamped month ends).
  // Longest possible period, so the estimate never overshoots.
  const approxDays = frequency === "WEEKLY" ? 7 : frequency === "MONTHLY" ? 31 : 366;
  let n = Math.max(0, Math.floor((current.getTime() - start.getTime()) / (approxDays * Math.max(1, interval) * 86_400_000)) - 1);
  let d = occurrence(start, frequency, interval, n);
  while (d.getTime() <= current.getTime()) d = occurrence(start, frequency, interval, ++n);
  return d;
}

/** "Every month", "Every 2 weeks"... */
export function describeFrequency(frequency: FrequencyValue, interval: number) {
  const label = FREQUENCY_LABELS[frequency];
  return interval <= 1 ? `Every ${label.one}` : `Every ${interval} ${label.many}`;
}
