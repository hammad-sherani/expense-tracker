import "server-only";
import { db } from "@/lib/db";
import { roundMoney } from "@/lib/format";
import { settlePlan, type Transfer } from "@/lib/settle";
import { expenseInclude, toExpenseDTO } from "@/server/queries/expenses";
import type { ExpenseDTO } from "@/types";

export const ME = "me";

export type GroupMember = { id: string; name: string; paid: number; share: number; balance: number };

export type GroupSummary = {
  id: string;
  name: string;
  emoji: string | null;
  archived: boolean;
  memberIds: string[];
  memberNames: string[];
  expenseCount: number;
  total: number;
  /** + = the group owes me, − = I owe the group. */
  myBalance: number;
};

export type GroupDetail = GroupSummary & {
  members: GroupMember[];
  plan: (Transfer & { fromName: string; toName: string })[];
  expenses: ExpenseDTO[];
};

type Row = {
  amount: number;
  splitTotal: number | null;
  paidByFriendId: string | null;
  shares: { friendId: string | null; amount: number }[];
};

/** paid − share for everyone in the group's bills. */
function balances(rows: Row[]) {
  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const r of rows) {
    const total = r.splitTotal ?? r.amount;
    add(paid, r.paidByFriendId ?? ME, total);
    // A bill that wasn't split is all mine.
    const shares = r.shares?.length ? r.shares : [{ friendId: null, amount: r.amount }];
    for (const s of shares) add(share, s.friendId ?? ME, s.amount);
  }
  return { paid, share };
}

export async function listGroups(userId: string): Promise<GroupSummary[]> {
  const [groups, friends, rows] = await Promise.all([
    db.group.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.friend.findMany({ where: { userId }, select: { id: true, name: true } }),
    db.expense.findMany({
      where: { userId, groupId: { not: null } },
      select: { groupId: true, amount: true, splitTotal: true, paidByFriendId: true, shares: true },
    }),
  ]);
  const names = new Map(friends.map((f) => [f.id, f.name]));
  return groups.map((g) => {
    const mine = rows.filter((r) => r.groupId === g.id);
    const { paid, share } = balances(mine);
    return {
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      archived: Boolean(g.archivedAt),
      memberIds: g.memberIds,
      memberNames: g.memberIds.map((id) => names.get(id)).filter((n): n is string => Boolean(n)),
      expenseCount: mine.length,
      total: roundMoney(mine.reduce((a, r) => a + (r.splitTotal ?? r.amount), 0)),
      myBalance: roundMoney((paid.get(ME) ?? 0) - (share.get(ME) ?? 0)),
    };
  });
}

export async function getGroup(userId: string, id: string): Promise<GroupDetail | null> {
  const group = await db.group.findFirst({ where: { id, userId } });
  if (!group) return null;
  const [friends, expenses] = await Promise.all([
    db.friend.findMany({ where: { userId }, select: { id: true, name: true } }),
    db.expense.findMany({
      where: { userId, groupId: id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: expenseInclude,
    }),
  ]);
  const names = new Map(friends.map((f) => [f.id, f.name]));
  const nameOf = (pid: string) => (pid === ME ? "You" : (names.get(pid) ?? "Removed person"));
  const { paid, share } = balances(expenses);

  // Members: me, the group's people, plus anyone who appears on its bills.
  const ids = new Set<string>([ME, ...group.memberIds, ...paid.keys(), ...share.keys()]);
  const members: GroupMember[] = [...ids].map((pid) => {
    const p = roundMoney(paid.get(pid) ?? 0);
    const s = roundMoney(share.get(pid) ?? 0);
    return { id: pid, name: nameOf(pid), paid: p, share: s, balance: roundMoney(p - s) };
  });
  members.sort((a, b) => (a.id === ME ? -1 : b.id === ME ? 1 : a.name.localeCompare(b.name)));

  const plan = settlePlan(new Map(members.map((m) => [m.id, m.balance]))).map((t) => ({
    ...t,
    fromName: nameOf(t.from),
    toName: nameOf(t.to),
  }));

  return {
    id: group.id,
    name: group.name,
    emoji: group.emoji,
    archived: Boolean(group.archivedAt),
    memberIds: group.memberIds,
    memberNames: group.memberIds.map((m) => names.get(m)).filter((n): n is string => Boolean(n)),
    expenseCount: expenses.length,
    total: roundMoney(expenses.reduce((a, r) => a + (r.splitTotal ?? r.amount), 0)),
    myBalance: members.find((m) => m.id === ME)?.balance ?? 0,
    members,
    plan,
    expenses: expenses.map(toExpenseDTO),
  };
}
