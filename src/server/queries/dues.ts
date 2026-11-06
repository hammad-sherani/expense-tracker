import "server-only";
import { db } from "@/lib/db";
import { toDateInput } from "@/lib/dates";
import { roundMoney } from "@/lib/format";
import type { DueDirectionValue, DuesSummary, FriendDuesDTO } from "@/types";

export type DueStatusFilter = "pending" | "settled" | "all";

const remainingOf = (d: { amount: number; paidAmount: number }) => roundMoney(Math.max(0, d.amount - d.paidAmount));

/** Pending totals in both directions. */
export async function getDuesSummary(userId: string): Promise<DuesSummary> {
  const dues = await db.due.findMany({
    where: { userId },
    select: { direction: true, amount: true, paidAmount: true, friendId: true },
  });
  let owedToMe = 0;
  let iOwe = 0;
  const owing = new Set<string>();
  for (const d of dues) {
    const r = remainingOf(d);
    if (r <= 0) continue;
    if (d.direction === "OWED_TO_ME") {
      owedToMe += r;
      owing.add(d.friendId);
    } else iOwe += r;
  }
  return {
    owedToMe: roundMoney(owedToMe),
    iOwe: roundMoney(iOwe),
    net: roundMoney(owedToMe - iOwe),
    friendsOwing: owing.size,
  };
}

/** Dues for one direction, grouped by friend, biggest pending balance first. */
export async function listDuesByFriend(
  userId: string,
  direction: DueDirectionValue,
  status: DueStatusFilter,
): Promise<FriendDuesDTO[]> {
  const dues = await db.due.findMany({
    where: { userId, direction },
    orderBy: { createdAt: "desc" },
    include: {
      friend: { select: { id: true, name: true } },
      expense: { select: { id: true, description: true, date: true, splitTotal: true } },
      payments: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
    },
  });

  const groups = new Map<string, FriendDuesDTO>();
  for (const d of dues) {
    const remaining = remainingOf(d);
    if (status === "pending" && remaining <= 0) continue;
    if (status === "settled" && remaining > 0) continue;

    let group = groups.get(d.friendId);
    if (!group) {
      group = { friend: d.friend, remaining: 0, dues: [] };
      groups.set(d.friendId, group);
    }
    group.remaining = roundMoney(group.remaining + remaining);
    group.dues.push({
      id: d.id,
      description: d.expense?.description ?? d.description ?? "Money owed",
      date: toDateInput(d.expense?.date ?? d.date ?? d.createdAt),
      standalone: d.expenseId === null,
      direction: d.direction,
      amount: d.amount,
      paidAmount: d.paidAmount,
      remaining,
      createdAt: d.createdAt.toISOString(),
      expense: d.expense
        ? {
            id: d.expense.id,
            description: d.expense.description,
            date: toDateInput(d.expense.date),
            splitTotal: d.expense.splitTotal,
          }
        : null,
      payments: d.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        date: toDateInput(p.date),
        note: p.note,
      })),
    });
  }

  // Sort each friend's dues by date, newest first.
  for (const g of groups.values()) {
    g.dues.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }
  return [...groups.values()].sort((a, b) => b.remaining - a.remaining || a.friend.name.localeCompare(b.friend.name));
}
