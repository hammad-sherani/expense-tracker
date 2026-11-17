/** Savings goal maths. Pure, so it runs on the server, in the browser and in tests. */
import { formatCurrency } from "./format";

export type GoalStatus = "reached" | "covered" | "short" | "passed";

export type GoalPlanInput = {
  targetAmount: number;
  targetDate: Date | null;
  /** Deposits minus withdrawals. */
  saved: number;
  /** Paid out of the fund as expenses. */
  spent: number;
  today: Date;
  /** Payments still expected for this goal. `share` is the part planned for the goal. */
  expected: { share: number; date: Date }[];
};

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Calendar months from today to the date: at least 1 if it's still ahead, 0 once passed. */
export function monthsUntil(today: Date, target: Date) {
  if (target < today) return 0;
  const months =
    target.getUTCFullYear() * 12 + target.getUTCMonth() - (today.getUTCFullYear() * 12 + today.getUTCMonth());
  return Math.max(1, months);
}

/** Rounded up, so saving this amount every month actually reaches the target. */
const perMonth = (amount: number, months: number | null) =>
  months && amount > 0 ? Math.ceil(amount / months) : amount > 0 && months === null ? null : 0;

export function goalPlan(g: GoalPlanInput) {
  const saved = money(g.saved);
  const balance = money(g.saved - g.spent);
  const remaining = money(Math.max(0, g.targetAmount - saved));
  const percent = g.targetAmount > 0 ? (saved / g.targetAmount) * 100 : 0;
  const monthsLeft = g.targetDate ? monthsUntil(g.today, g.targetDate) : null;

  // Only payments due by the target date can help reach it.
  const counted = g.expected.filter((e) => !g.targetDate || e.date <= g.targetDate);
  const expectedTotal = money(counted.reduce((a, e) => a + e.share, 0));
  const shortAfterExpected = money(Math.max(0, remaining - expectedTotal));

  const status: GoalStatus =
    remaining === 0 ? "reached" : monthsLeft === 0 ? "passed" : shortAfterExpected === 0 ? "covered" : "short";

  return {
    saved,
    balance,
    spent: money(g.spent),
    remaining,
    percent,
    monthsLeft,
    perMonth: perMonth(remaining, monthsLeft),
    expectedTotal,
    expectedCount: counted.length,
    shortAfterExpected,
    perMonthAfterExpected: perMonth(shortAfterExpected, monthsLeft),
    status,
  };
}

/** One plain sentence saying where the goal stands. */
export function planSummary(p: ReturnType<typeof goalPlan>) {
  if (p.status === "reached") return "You've reached your target.";
  if (p.status === "passed") return `The date has passed and you're still ${formatCurrency(p.remaining)} short.`;
  if (p.status === "covered") return `Your expected payments cover the remaining ${formatCurrency(p.remaining)}.`;
  const short = formatCurrency(p.shortAfterExpected);
  const lead = p.expectedCount > 0 ? `Short by ${short} even after expected payments` : `${short} still to save`;
  if (p.monthsLeft === null || p.perMonthAfterExpected === null) return `${lead}.`;
  return `${lead}: save ${formatCurrency(p.perMonthAfterExpected)} a month for ${p.monthsLeft} month${p.monthsLeft === 1 ? "" : "s"}.`;
}
