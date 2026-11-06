import "server-only";
import { db } from "@/lib/db";
import { roundMoney } from "@/lib/format";
import type { WalletTypeValue } from "@/lib/wallets";
import type { CategoryDTO, WalletDTO } from "@/types";

export async function listCategories(userId: string): Promise<CategoryDTO[]> {
  const rows = await db.category.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, icon: true, color: true, archivedAt: true },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color, archived: Boolean(c.archivedAt) }));
}

const notSet = <K extends string>(key: K) => [{ [key]: null }, { [key]: { isSet: false } }] as const;

/**
 * Current balance of every wallet:
 * opening + income − money spent (whole bill when I paid a split) ± transfers ± due repayments
 * − standalone dues I paid fully for someone.
 */
export async function walletBalances(userId: string): Promise<Map<string, number>> {
  const iPaid = { OR: notSet("paidByFriendId") as never };
  const [wallets, incomes, spent, splitShares, tOut, tIn, payments, lent] = await Promise.all([
    db.wallet.findMany({ where: { userId }, select: { id: true, openingBalance: true } }),
    db.income.groupBy({ by: ["walletId"], where: { userId, walletId: { not: null } }, _sum: { amount: true } }),
    db.expense.groupBy({
      by: ["walletId"],
      where: { userId, walletId: { not: null }, ...iPaid },
      _sum: { amount: true, splitTotal: true },
    }),
    // Split bills I paid: the wallet paid the whole bill (splitTotal), not just my share (amount).
    db.expense.groupBy({
      by: ["walletId"],
      where: { userId, walletId: { not: null }, splitTotal: { not: null }, ...iPaid },
      _sum: { amount: true },
    }),
    db.transfer.groupBy({ by: ["fromWalletId"], where: { userId }, _sum: { amount: true } }),
    db.transfer.groupBy({ by: ["toWalletId"], where: { userId }, _sum: { amount: true } }),
    db.duePayment.findMany({
      where: { userId, walletId: { not: null } },
      select: { amount: true, walletId: true, due: { select: { direction: true } } },
    }),
    db.due.groupBy({
      by: ["walletId"],
      where: { userId, walletId: { not: null }, direction: "OWED_TO_ME", OR: notSet("expenseId") as never },
      _sum: { amount: true },
    }),
  ]);

  const balance = new Map(wallets.map((w) => [w.id, w.openingBalance]));
  const add = (id: string | null, v: number | null | undefined) => {
    if (id && balance.has(id) && v) balance.set(id, balance.get(id)! + v);
  };
  for (const r of incomes) add(r.walletId, r._sum.amount);
  for (const r of spent) add(r.walletId, -((r._sum.amount ?? 0) + (r._sum.splitTotal ?? 0)));
  for (const r of splitShares) add(r.walletId, r._sum.amount); // undo "my share" for split bills (replaced by splitTotal)
  for (const r of tOut) add(r.fromWalletId, -(r._sum.amount ?? 0));
  for (const r of tIn) add(r.toWalletId, r._sum.amount);
  for (const p of payments) add(p.walletId, p.due.direction === "OWED_TO_ME" ? p.amount : -p.amount);
  for (const r of lent) add(r.walletId, -(r._sum.amount ?? 0));

  for (const [id, v] of balance) balance.set(id, roundMoney(v));
  return balance;
}

export async function listWallets(userId: string, withBalances = true): Promise<WalletDTO[]> {
  const [rows, balances] = await Promise.all([
    db.wallet.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, type: true, color: true, openingBalance: true, archivedAt: true },
    }),
    withBalances ? walletBalances(userId) : Promise.resolve(new Map<string, number>()),
  ]);
  return rows.map((w) => ({
    id: w.id,
    name: w.name,
    type: w.type as WalletTypeValue,
    color: w.color,
    openingBalance: w.openingBalance,
    balance: balances.get(w.id) ?? w.openingBalance,
    archived: Boolean(w.archivedAt),
  }));
}

/** The wallet used for the most recent expense, to preselect in the form. */
export async function lastUsedWalletId(userId: string) {
  const last = await db.expense.findFirst({
    where: { userId, walletId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { walletId: true },
  });
  return last?.walletId ?? null;
}

/** Active groups for pickers. */
export async function listGroupOptions(userId: string) {
  const rows = await db.group.findMany({
    where: { userId, OR: [{ archivedAt: null }, { archivedAt: { isSet: false } }] },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, emoji: true, memberIds: true },
  });
  return rows;
}
