import "server-only";
import { db } from "@/lib/db";
import { toDateInput, todayUTC } from "@/lib/dates";
import { roundMoney } from "@/lib/format";
import { goalPlan } from "@/lib/goals";

export type GoalOption = { id: string; name: string };

export type GoalDTO = ReturnType<typeof goalPlan> & {
  id: string;
  name: string;
  targetAmount: number;
  targetDate: string | null;
  notes: string | null;
  archived: boolean;
  hasSpending: boolean;
};

export type ExpectedDTO = {
  id: string;
  source: string;
  amount: number;
  expectedDate: string;
  goal: GoalOption | null;
  /** Planned share for the goal; null means all of it. */
  goalAmount: number | null;
  received: boolean;
  receivedAt: string | null;
  receivedAmount: number | null;
  /** How much of it went into a fund. */
  toFund: number;
  overdue: boolean;
  notes: string | null;
};

export type GoalHistoryRow = {
  id: string;
  kind: "deposit" | "withdraw" | "spend";
  date: string;
  title: string;
  subtitle: string;
  /** + into the fund, − out of it. */
  amount: number;
  /** Set when the row can be removed here. */
  entryId: string | null;
  createdAt: string;
};

const share = (p: { amount: number; goalAmount: number | null }) => p.goalAmount ?? p.amount;

async function loadAll(userId: string) {
  const [goals, entries, spending, pending] = await Promise.all([
    db.goal.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.goalEntry.groupBy({ by: ["goalId", "type"], where: { userId }, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["goalId"], where: { userId, goalId: { not: null } }, _sum: { amount: true } }),
    db.expectedPayment.findMany({
      where: { userId, goalId: { not: null }, OR: [{ receivedAt: null }, { receivedAt: { isSet: false } }] },
      select: { goalId: true, amount: true, goalAmount: true, expectedDate: true },
    }),
  ]);
  return { goals, entries, spending, pending };
}

function toDTO(
  g: Awaited<ReturnType<typeof loadAll>>["goals"][number],
  data: Awaited<ReturnType<typeof loadAll>>,
): GoalDTO {
  const of = (type: "DEPOSIT" | "WITHDRAW") =>
    data.entries.find((e) => e.goalId === g.id && e.type === type)?._sum.amount ?? 0;
  const spent = data.spending.find((s) => s.goalId === g.id)?._sum.amount ?? 0;
  const plan = goalPlan({
    targetAmount: g.targetAmount,
    targetDate: g.targetDate,
    saved: of("DEPOSIT") - of("WITHDRAW"),
    spent,
    today: todayUTC(),
    expected: data.pending.filter((p) => p.goalId === g.id).map((p) => ({ share: share(p), date: p.expectedDate })),
  });
  return {
    ...plan,
    id: g.id,
    name: g.name,
    targetAmount: g.targetAmount,
    targetDate: g.targetDate ? toDateInput(g.targetDate) : null,
    notes: g.notes,
    archived: Boolean(g.archivedAt),
    hasSpending: spent > 0,
  };
}

export async function listGoals(userId: string): Promise<GoalDTO[]> {
  const data = await loadAll(userId);
  return data.goals.map((g) => toDTO(g, data));
}

export async function listExpected(userId: string, goalId?: string) {
  const today = todayUTC();
  const rows = await db.expectedPayment.findMany({
    where: { userId, ...(goalId ? { goalId } : {}) },
    orderBy: { expectedDate: "asc" },
    include: {
      goal: { select: { id: true, name: true } },
      entries: { select: { amount: true, type: true } },
    },
  });
  const all = rows.map((p): ExpectedDTO => ({
    id: p.id,
    source: p.source,
    amount: p.amount,
    expectedDate: toDateInput(p.expectedDate),
    goal: p.goal,
    goalAmount: p.goalAmount,
    received: Boolean(p.receivedAt),
    receivedAt: p.receivedAt ? toDateInput(p.receivedAt) : null,
    receivedAmount: p.receivedAmount,
    toFund: roundMoney(p.entries.filter((e) => e.type === "DEPOSIT").reduce((a, e) => a + e.amount, 0)),
    overdue: !p.receivedAt && p.expectedDate < today,
    notes: p.notes,
  }));
  return {
    pending: all.filter((p) => !p.received),
    received: all.filter((p) => p.received).sort((a, b) => b.receivedAt!.localeCompare(a.receivedAt!)).slice(0, 10),
  };
}

export async function getGoal(userId: string, id: string) {
  const data = await loadAll(userId);
  const row = data.goals.find((g) => g.id === id);
  if (!row) return null;
  const [entries, expenses, expected] = await Promise.all([
    db.goalEntry.findMany({
      where: { userId, goalId: id },
      include: { wallet: { select: { name: true } }, expectedPayment: { select: { source: true } } },
    }),
    db.expense.findMany({
      where: { userId, goalId: id },
      include: { category: { select: { name: true } } },
    }),
    listExpected(userId, id),
  ]);
  const history: GoalHistoryRow[] = [
    ...entries.map((e): GoalHistoryRow => ({
      id: `e:${e.id}`,
      kind: e.type === "DEPOSIT" ? "deposit" : "withdraw",
      date: toDateInput(e.date),
      title: e.expectedPayment ? `From ${e.expectedPayment.source}` : e.note || (e.type === "DEPOSIT" ? "Money added" : "Money taken out"),
      subtitle: e.wallet?.name ?? (e.type === "DEPOSIT" ? "Not from a wallet" : "Not into a wallet"),
      amount: e.type === "DEPOSIT" ? e.amount : -e.amount,
      entryId: e.expectedPayment ? null : e.id,
      createdAt: e.createdAt.toISOString(),
    })),
    ...expenses.map((x): GoalHistoryRow => ({
      id: `x:${x.id}`,
      kind: "spend",
      date: toDateInput(x.date),
      title: x.description,
      subtitle: `Paid from fund · ${x.category?.name ?? "Expense"}`,
      amount: -x.amount,
      entryId: null,
      createdAt: x.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return { goal: toDTO(row, data), history, expected };
}
