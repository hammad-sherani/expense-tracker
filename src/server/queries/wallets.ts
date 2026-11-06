import "server-only";
import { db } from "@/lib/db";
import { toDateInput } from "@/lib/dates";
import { roundMoney } from "@/lib/format";
import { INCOME_TYPE_LABELS } from "@/lib/wallets";

export type WalletActivity = {
  id: string;
  kind: "expense" | "income" | "transfer-in" | "transfer-out" | "repayment" | "lent";
  /** Calendar day "YYYY-MM-DD". */
  date: string;
  title: string;
  subtitle: string;
  /** + money in, − money out. */
  amount: number;
  /** For transfers, which can be removed from this page. */
  transferId?: string;
  createdAt: string;
};

const LIMIT = 100;

/** Everything that moved money in or out of one wallet, newest first. */
export async function getWalletActivity(userId: string, walletId: string): Promise<WalletActivity[]> {
  const [expenses, incomes, transfers, payments, lent] = await Promise.all([
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
  ]);

  const items: WalletActivity[] = [
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
      createdAt: i.createdAt.toISOString(),
    })),
    ...transfers.map((t) => {
      const incoming = t.toWalletId === walletId;
      return {
        id: `t:${t.id}`,
        kind: incoming ? ("transfer-in" as const) : ("transfer-out" as const),
        date: toDateInput(t.date),
        title: incoming ? `From ${t.fromWallet.name}` : `To ${t.toWallet.name}`,
        subtitle: ["Transfer", t.note].filter(Boolean).join(" · "),
        amount: incoming ? t.amount : -t.amount,
        transferId: t.id,
        createdAt: t.createdAt.toISOString(),
      };
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
      createdAt: d.createdAt.toISOString(),
    })),
  ].filter((i) => i.amount !== 0 || i.kind === "expense");

  return items
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
    .slice(0, LIMIT)
    .map((i) => ({ ...i, amount: roundMoney(i.amount) }));
}
