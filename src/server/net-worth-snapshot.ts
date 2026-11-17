import "server-only";
import { db } from "@/lib/db";
import { currentYearMonth } from "@/lib/dates";
import type { NetWorth } from "@/server/queries/net-worth";
import { getPortfolio } from "@/server/queries/portfolio";

/** How old this month's saved value can get before an app visit refreshes it. */
const MAX_AGE_MS = 60 * 60 * 1000;

const monthKey = () => {
  const { year, month } = currentYearMonth();
  return `${year}-${String(month).padStart(2, "0")}`;
};

/**
 * Saves this month's net worth, at most once an hour. Earlier months are never
 * changed, so each keeps the last value seen in that month.
 */
export async function refreshNetWorthSnapshot(userId: string) {
  const month = monthKey();
  const existing = await db.netWorthSnapshot.findUnique({ where: { userId_month: { userId, month } }, select: { takenAt: true } });
  if (existing && Date.now() - existing.takenAt.getTime() < MAX_AGE_MS) return;
  const { netWorth } = await getPortfolio(userId);
  await saveNetWorthSnapshot(userId, netWorth);
}

/** Saves an already computed net worth as this month's value (the Portfolio page shows it anyway). */
export async function saveNetWorthSnapshot(userId: string, n: NetWorth) {
  const month = monthKey();
  const data = {
    total: n.total,
    cash: n.cash,
    investments: n.investments,
    committees: n.committees,
    goals: n.goals,
    owedToMe: n.owedToMe,
    iOwe: n.iOwe,
    loans: n.loans,
    takenAt: new Date(),
  };
  await db.netWorthSnapshot.upsert({ where: { userId_month: { userId, month } }, create: { userId, month, ...data }, update: data });
}
