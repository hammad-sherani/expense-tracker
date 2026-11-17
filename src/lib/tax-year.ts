/**
 * Pakistan's tax year runs July to June and is named after the year it ends in:
 * TY2027 = 1 Jul 2026 – 30 Jun 2027. Dates are calendar days at UTC midnight.
 */
import { MONTH_NAMES } from "./dates";

/** The tax year a calendar day falls in. */
export function taxYearOf(date: Date) {
  const y = date.getUTCFullYear();
  return date.getUTCMonth() >= 6 ? y + 1 : y;
}

/** [start, end): 1 July of the previous year up to (not including) 1 July of `ty`. */
export function taxYearRange(ty: number) {
  return { start: new Date(Date.UTC(ty - 1, 6, 1)), end: new Date(Date.UTC(ty, 6, 1)) };
}

/** 30 June of the tax year: the date the wealth statement is made at. */
export function taxYearEndDay(ty: number) {
  return new Date(Date.UTC(ty, 5, 30));
}

export function taxYearLabel(ty: number, short = false) {
  return short ? `TY${ty}` : `TY${ty} (Jul ${ty - 1} – Jun ${ty})`;
}

/** Whole months of the tax year still to come after `today`'s month (0 in June). */
export function monthsLeftInTaxYear(ty: number, today: Date) {
  const { start, end } = taxYearRange(ty);
  if (today < start) return 12;
  if (today >= end) return 0;
  const elapsed = (today.getUTCFullYear() - start.getUTCFullYear()) * 12 + today.getUTCMonth() - start.getUTCMonth() + 1;
  return 12 - elapsed;
}

/** "Jul 2026" style label for month `i` (0 = July) of the tax year. */
export function taxYearMonthLabel(ty: number, i: number) {
  const m = (6 + i) % 12;
  const y = m >= 6 ? ty - 1 : ty;
  return `${MONTH_NAMES[m].slice(0, 3)} ${y}`;
}
