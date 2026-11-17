import "server-only";
import { db } from "@/lib/db";
import { roundMoney } from "@/lib/format";
import { listCommittees } from "@/server/queries/committees";
import { getDuesSummary } from "@/server/queries/dues";
import { listGoals } from "@/server/queries/goals";
import { listLoans, totalLoanBalance } from "@/server/queries/loans";
import { listWallets } from "@/server/queries/lookups";

export type NetWorth = {
  cash: number;
  investments: number;
  owedToMe: number;
  iOwe: number;
  committees: number;
  hasCommittees: boolean;
  goals: number;
  hasGoals: boolean;
  /** What's still owed on loans (credit cards are already negative wallets). */
  loans: number;
  hasLoans: boolean;
  total: number;
};

/** Everything you own minus everything you owe. `investments` is today's value of the portfolio. */
export async function netWorthParts(userId: string, investments: number): Promise<NetWorth> {
  const [wallets, dues, committeeList, goalList, loanList] = await Promise.all([
    listWallets(userId),
    getDuesSummary(userId),
    listCommittees(userId),
    listGoals(userId),
    listLoans(userId),
  ]);
  const goals = roundMoney(goalList.filter((g) => !g.archived).reduce((a, g) => a + g.balance, 0));
  // Money waiting in committees, or (if the pot came early) still to be paid back.
  const committees = roundMoney(committeeList.filter((c) => !c.archived).reduce((a, c) => a + c.position, 0));
  const cash = roundMoney(wallets.filter((w) => !w.archived).reduce((a, w) => a + w.balance, 0));
  const loans = totalLoanBalance(loanList);
  return {
    cash,
    investments,
    owedToMe: dues.owedToMe,
    iOwe: dues.iOwe,
    committees,
    hasCommittees: committeeList.some((c) => !c.archived),
    goals,
    hasGoals: goalList.some((g) => !g.archived),
    loans,
    hasLoans: loanList.some((l) => !l.archived),
    total: roundMoney(cash + investments + committees + goals + dues.owedToMe - dues.iOwe - loans),
  };
}

export type NetWorthPoint = { month: string; label: string; total: number };

/** Month-end net worth, oldest first (the current month is today's value). */
export async function listNetWorthHistory(userId: string): Promise<NetWorthPoint[]> {
  const rows = await db.netWorthSnapshot.findMany({ where: { userId }, orderBy: { month: "asc" }, take: 120 });
  return rows.map((r) => {
    const [y, m] = r.month.split("-").map(Number);
    const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
    return { month: r.month, label, total: r.total };
  });
}
