import "server-only";
import { db } from "@/lib/db";
import { toDateInput } from "@/lib/dates";
import { roundMoney } from "@/lib/format";
import { unitsLabel } from "@/lib/portfolio";
import { INCOME_TYPE_LABELS } from "@/lib/wallets";

export type WalletActivity = {
  id: string;
  kind: "expense" | "income" | "transfer-in" | "transfer-out" | "repayment" | "lent" | "investment" | "committee" | "goal" | "loan" | "adjustment";
  /** Calendar day "YYYY-MM-DD". */
  date: string;
  title: string;
  subtitle: string;
  /** + money in, − money out. */
  amount: number;
  /** The wallet this row moved money in or out of. */
  walletId: string;
  /** Balance of the wallet(s) shown, right after this row. */
  balanceAfter: number;
  /** For transfers, which can be removed from this page. */
  transferId?: string;
  /** For balance adjustments, which can be removed from this page. */
  adjustmentId?: string;
  createdAt: string;
};

export const ACTIVITY_LIMIT = 100;
const LIMIT = ACTIVITY_LIMIT;

/**
 * Everything that moved money in or out of the given wallets, newest first, with the running
 * balance after each row (worked back from `currentBalance`, the wallets' balance today).
 */
export async function getWalletActivity(
  userId: string,
  walletIds: string[],
  currentBalance: number,
): Promise<WalletActivity[]> {
  if (walletIds.length === 0) return [];
  const ids = new Set(walletIds);
  const walletId = { in: walletIds };
  const [expenses, incomes, transfers, payments, lent, investing, committeePaid, pots, goalMoney, borrowed, loanPaid, collected, adjustments] = await Promise.all([
    db.expense.findMany({
      where: { userId, walletId },
      orderBy: { date: "desc" },
      take: LIMIT,
      select: {
        id: true,
        description: true,
        date: true,
        amount: true,
        splitTotal: true,
        paidByFriendId: true,
        walletId: true,
        createdAt: true,
        category: { select: { name: true } },
      },
    }),
    db.income.findMany({ where: { userId, walletId }, orderBy: { date: "desc" }, take: LIMIT }),
    db.transfer.findMany({
      where: { userId, OR: [{ fromWalletId: walletId }, { toWalletId: walletId }] },
      orderBy: { date: "desc" },
      take: LIMIT,
      include: { fromWallet: { select: { name: true } }, toWallet: { select: { name: true } } },
    }),
    db.duePayment.findMany({
      where: { userId, walletId },
      orderBy: { date: "desc" },
      take: LIMIT,
      include: { due: { select: { direction: true, description: true, friend: { select: { name: true } }, expense: { select: { description: true } } } } },
    }),
    db.due.findMany({
      where: { userId, walletId, OR: [{ expenseId: null }, { expenseId: { isSet: false } }], direction: "OWED_TO_ME" },
      orderBy: { date: "desc" },
      take: LIMIT,
      include: { friend: { select: { name: true } } },
    }),
    db.investmentTxn.findMany({
      where: { userId, walletId },
      orderBy: { date: "desc" },
      take: LIMIT,
      include: { investment: { select: { name: true, unit: true } } },
    }),
    db.committeePayment.findMany({
      where: { userId, walletId },
      orderBy: { date: "desc" },
      take: LIMIT,
      include: { committee: { select: { name: true, members: true, forFriend: { select: { name: true } } } } },
    }),
    db.committee.findMany({ where: { userId, payoutWalletId: walletId }, orderBy: { payoutAt: "desc" }, take: LIMIT }),
    db.goalEntry.findMany({
      where: { userId, walletId },
      orderBy: { date: "desc" },
      take: LIMIT,
      include: { goal: { select: { name: true } } },
    }),
    db.loan.findMany({ where: { userId, receivedWalletId: walletId }, orderBy: { createdAt: "desc" }, take: LIMIT }),
    db.loanPayment.findMany({
      where: { userId, walletId },
      orderBy: { date: "desc" },
      take: LIMIT,
      include: { loan: { select: { name: true } } },
    }),
    db.committeeCollection.findMany({
      where: { userId, walletId },
      orderBy: { date: "desc" },
      take: LIMIT,
      include: { committee: { select: { name: true, members: true, forFriend: { select: { name: true } } } } },
    }),
    db.walletAdjustment.findMany({ where: { userId, walletId }, orderBy: { date: "desc" }, take: LIMIT }),
  ]);

  type Row = Omit<WalletActivity, "balanceAfter">;
  const items: Row[] = [
    ...expenses.map((e) => {
      // When a friend paid, nothing left my wallet.
      const out = e.paidByFriendId ? 0 : (e.splitTotal ?? e.amount);
      return {
        id: `e:${e.id}`,
        kind: "expense" as const,
        date: toDateInput(e.date),
        title: e.description,
        subtitle: [e.category?.name ?? "Expense", e.splitTotal !== null ? "split bill" : null].filter(Boolean).join(" · "),
        amount: -out,
        walletId: e.walletId!,
        createdAt: e.createdAt.toISOString(),
      };
    }),
    ...incomes.map((i) => ({
      id: `i:${i.id}`,
      kind: "income" as const,
      date: toDateInput(i.date),
      title: i.source,
      subtitle: `Income · ${INCOME_TYPE_LABELS[i.type]}`,
      amount: i.amount,
      walletId: i.walletId!,
      createdAt: i.createdAt.toISOString(),
    })),
    // A transfer between two of the shown wallets appears twice: out of one, into the other.
    ...transfers.flatMap((t) => {
      const base = { date: toDateInput(t.date), subtitle: ["Transfer", t.note].filter(Boolean).join(" · "), transferId: t.id, createdAt: t.createdAt.toISOString() };
      const rows: Row[] = [];
      if (ids.has(t.toWalletId)) {
        rows.push({ ...base, id: `t:${t.id}:in`, kind: "transfer-in", title: `From ${t.fromWallet.name}`, amount: t.amount, walletId: t.toWalletId });
      }
      if (ids.has(t.fromWalletId)) {
        rows.push({ ...base, id: `t:${t.id}:out`, kind: "transfer-out", title: `To ${t.toWallet.name}`, amount: -t.amount, walletId: t.fromWalletId });
      }
      return rows;
    }),
    ...payments.map((p) => {
      const received = p.due.direction === "OWED_TO_ME";
      const what = p.due.expense?.description ?? p.due.description ?? "a bill";
      return {
        id: `p:${p.id}`,
        kind: "repayment" as const,
        date: toDateInput(p.date),
        title: received ? `${p.due.friend.name} paid you back` : `You paid ${p.due.friend.name}`,
        subtitle: `For ${what}`,
        amount: received ? p.amount : -p.amount,
        walletId: p.walletId!,
        createdAt: p.createdAt.toISOString(),
      };
    }),
    ...lent.map((d) => ({
      id: `d:${d.id}`,
      kind: "lent" as const,
      date: toDateInput(d.date ?? d.createdAt),
      title: d.description ?? "Paid for someone",
      subtitle: `Paid for ${d.friend.name} · they owe you`,
      amount: -d.amount,
      walletId: d.walletId!,
      createdAt: d.createdAt.toISOString(),
    })),
    ...investing.map((t) => ({
      id: `v:${t.id}`,
      kind: "investment" as const,
      date: toDateInput(t.date),
      title:
        t.type === "DIVIDEND"
          ? `Dividend from ${t.investment.name}`
          : `${t.type === "BUY" ? "Bought" : "Sold"} ${unitsLabel(t.units, t.investment.unit)} ${t.investment.name}`,
      subtitle: "Investment",
      amount: t.type === "BUY" ? -t.amount : t.amount,
      walletId: t.walletId!,
      createdAt: t.createdAt.toISOString(),
    })),
    ...committeePaid.map((p) => ({
      id: `c:${p.id}`,
      kind: "committee" as const,
      date: toDateInput(p.date),
      title: `Committee installment ${p.installment}/${p.committee.members}`,
      subtitle: p.committee.forFriend ? `${p.committee.name} · for ${p.committee.forFriend.name}` : p.committee.name,
      amount: -p.amount,
      walletId: p.walletId!,
      createdAt: p.createdAt.toISOString(),
    })),
    ...pots.map((c) => ({
      id: `cp:${c.id}`,
      kind: "committee" as const,
      date: toDateInput(c.payoutAt ?? c.createdAt),
      title: "Committee pot received",
      subtitle: c.name,
      amount: c.payoutAmount ?? 0,
      walletId: c.payoutWalletId!,
      createdAt: (c.payoutAt ?? c.createdAt).toISOString(),
    })),
    ...goalMoney.map((e) => ({
      id: `g:${e.id}`,
      kind: "goal" as const,
      date: toDateInput(e.date),
      title: e.type === "DEPOSIT" ? `Set aside for ${e.goal.name}` : `Taken from ${e.goal.name} fund`,
      subtitle: "Savings goal",
      amount: e.type === "DEPOSIT" ? -e.amount : e.amount,
      walletId: e.walletId!,
      createdAt: e.createdAt.toISOString(),
    })),
    ...collected.map((p) => ({
      id: `cc:${p.id}`,
      kind: "committee" as const,
      date: toDateInput(p.date),
      title: `${p.committee.forFriend?.name ?? "Friend"} paid their committee share ${p.installment}/${p.committee.members}`,
      subtitle: p.committee.name,
      amount: p.amount,
      walletId: p.walletId!,
      createdAt: p.createdAt.toISOString(),
    })),
    ...borrowed.map((l) => ({
      id: `l:${l.id}`,
      kind: "loan" as const,
      date: toDateInput(l.createdAt),
      title: `Borrowed: ${l.name}`,
      subtitle: l.lender ? `Loan from ${l.lender}` : "Loan",
      amount: l.principal,
      walletId: l.receivedWalletId!,
      createdAt: l.createdAt.toISOString(),
    })),
    // The interest part shows as its own expense row above.
    ...loanPaid.map((p) => ({
      id: `lp:${p.id}`,
      kind: "loan" as const,
      date: toDateInput(p.date),
      title: `Loan repaid: ${p.loan.name}`,
      subtitle: "Loan amount (interest is shown as an expense)",
      amount: -p.principalPart,
      walletId: p.walletId!,
      createdAt: p.createdAt.toISOString(),
    })),
    ...adjustments.map((a) => ({
      id: `a:${a.id}`,
      kind: "adjustment" as const,
      date: toDateInput(a.date),
      title: a.amount > 0 ? "Balance adjusted up" : "Balance adjusted down",
      subtitle: ["Adjustment", a.note].filter(Boolean).join(" · "),
      amount: a.amount,
      walletId: a.walletId,
      adjustmentId: a.id,
      createdAt: a.createdAt.toISOString(),
    })),
  ].filter((i) => i.amount !== 0 || i.kind === "expense");

  const newest = items
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
    .slice(0, LIMIT);
  // Work backwards from today's balance: each row's balance is the newer row's balance minus that row's amount.
  let balance = currentBalance;
  return newest.map((i) => {
    const row = { ...i, amount: roundMoney(i.amount), balanceAfter: roundMoney(balance) };
    balance -= i.amount;
    return row;
  });
}
