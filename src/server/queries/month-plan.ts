import "server-only";
import { installmentDate } from "@/lib/committee";
import { db } from "@/lib/db";
import { currentYearMonth, monthLabel, monthRange, toDateInput, todayUTC } from "@/lib/dates";
import { roundMoney } from "@/lib/format";
import { upcomingInstallments } from "@/lib/loans";
import { nextOccurrence } from "@/lib/recurrence";

export type PlanItem = {
  key: string;
  name: string;
  kind: "bill" | "committee" | "goal" | "loan" | "investment";
  amount: number;
  status: "paid" | "due" | "overdue";
  /** "YYYY-MM-DD": when it was paid, or when it's due. */
  date: string;
};

export type MonthPlan = {
  label: string;
  income: number;
  items: PlanItem[];
  fixedPaid: number;
  fixedPending: number;
  fixedTotal: number;
  otherSpending: number;
  leftToSpend: number;
};

/** Safety limit on how many missed occurrences one bill can add. */
const MAX_OCCURRENCES = 60;

/**
 * Income minus the month's fixed payments and other spending. A fixed payment
 * counts once: as "paid" once recorded, as "due" until then. Overdue payments
 * from earlier months count in the current month, since they still have to be paid.
 */
export async function getMonthPlan(userId: string, year: number, month: number): Promise<MonthPlan> {
  const { start, end } = monthRange(year, month);
  const inMonth = { userId, date: { gte: start, lt: end } };
  const now = currentYearMonth();
  const isCurrent = now.year === year && now.month === month;
  const showPending = year * 12 + month >= now.year * 12 + now.month;
  const today = todayUTC();

  const [income, spent, paidBills, rules, payments, committees, fundExpenses, setAside, loanPaid, loans, investing] = await Promise.all([
    db.income.aggregate({ where: inMonth, _sum: { amount: true } }),
    db.expense.aggregate({ where: inMonth, _sum: { amount: true } }),
    db.expense.findMany({
      where: { ...inMonth, recurringId: { not: null } },
      select: { id: true, description: true, amount: true, date: true },
    }),
    showPending ? db.recurringExpense.findMany({ where: { userId, active: true } }) : Promise.resolve([]),
    db.committeePayment.findMany({
      where: { ...inMonth, committee: { OR: [{ forFriendId: null }, { forFriendId: { isSet: false } }] } },
      include: { committee: { select: { name: true, members: true } } },
    }),
    showPending
      ? db.committee.findMany({
          where: { userId, OR: [{ forFriendId: null }, { forFriendId: { isSet: false } }] },
          include: { payments: { select: { id: true } } },
        })
      : Promise.resolve([]),
    // Paid from money already set aside, so it isn't spending from this month's income.
    db.expense.aggregate({ where: { ...inMonth, goalId: { not: null } }, _sum: { amount: true } }),
    // Savings that came from outside the wallets (no wallet, no project payment) didn't use this month's income.
    db.goalEntry.findMany({
      where: { ...inMonth, OR: [{ walletId: { not: null } }, { expectedPaymentId: { not: null } }] },
      include: { goal: { select: { name: true } } },
    }),
    db.loanPayment.findMany({ where: inMonth, include: { loan: { select: { name: true } } } }),
    showPending
      ? db.loan.findMany({
          where: { userId, OR: [{ archivedAt: null }, { archivedAt: { isSet: false } }] },
          include: { payments: { select: { principalPart: true } } },
        })
      : Promise.resolve([]),
    // Gold, silver, shares bought from a wallet use this month's money (selling puts it back).
    db.investmentTxn.findMany({
      where: { ...inMonth, walletId: { not: null } },
      select: { investmentId: true, type: true, amount: true, date: true, investment: { select: { name: true } } },
    }),
  ]);

  const items: PlanItem[] = [
    ...paidBills.map((e): PlanItem => ({
      key: `e:${e.id}`,
      name: e.description,
      kind: "bill",
      amount: e.amount,
      status: "paid",
      date: toDateInput(e.date),
    })),
    ...payments.map((p): PlanItem => ({
      key: `p:${p.id}`,
      name: `${p.committee.name} (${p.installment}/${p.committee.members})`,
      kind: "committee",
      amount: p.amount,
      status: "paid",
      date: toDateInput(p.date),
    })),
    // The whole installment; its interest part is an expense, taken out of "other spending" below.
    ...loanPaid.map((p): PlanItem => ({
      key: `l:${p.id}`,
      name: p.loan.name,
      kind: "loan",
      amount: p.amount,
      status: "paid",
      date: toDateInput(p.date),
    })),
  ];

  const pending = (key: string, name: string, kind: PlanItem["kind"], amount: number, due: Date): PlanItem => ({
    key,
    name,
    kind,
    amount,
    status: due < today ? "overdue" : "due",
    date: toDateInput(due),
  });
  const counts = (due: Date) => due < end && (due >= start || isCurrent);

  for (const r of rules) {
    let due = r.nextDate;
    for (let i = 0; i < MAX_OCCURRENCES && due < end && (!r.endDate || due <= r.endDate); i++) {
      if (counts(due)) items.push(pending(`r:${r.id}:${i}`, r.description, "bill", r.amount, due));
      due = nextOccurrence(r.startDate, r.frequency, r.interval, due);
    }
  }

  for (const c of committees) {
    if (c.archivedAt) continue;
    for (let n = c.payments.length + 1; n <= c.members; n++) {
      const due = installmentDate(c.startDate, n);
      if (due >= end) break;
      if (counts(due)) items.push(pending(`c:${c.id}:${n}`, `${c.name} (${n}/${c.members})`, "committee", c.monthlyAmount, due));
    }
  }

  for (const l of loans) {
    for (const due of upcomingInstallments(l, end, MAX_OCCURRENCES)) {
      if (counts(due.date)) items.push(pending(`l:${l.id}:${due.n}`, l.name, "loan", due.amount, due.date));
    }
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  const byGoal = new Map<string, { name: string; amount: number; date: string }>();
  for (const e of setAside) {
    const row = byGoal.get(e.goalId) ?? { name: e.goal.name, amount: 0, date: "" };
    row.amount += e.type === "DEPOSIT" ? e.amount : -e.amount;
    const date = toDateInput(e.date);
    if (date > row.date) row.date = date;
    byGoal.set(e.goalId, row);
  }
  for (const [goalId, g] of byGoal) {
    const amount = roundMoney(g.amount);
    if (amount !== 0) items.push({ key: `g:${goalId}`, name: `${g.name} (set aside)`, kind: "goal", amount, status: "paid", date: g.date });
  }

  const byInvestment = new Map<string, { name: string; amount: number; date: string }>();
  for (const t of investing) {
    const row = byInvestment.get(t.investmentId) ?? { name: t.investment.name, amount: 0, date: "" };
    row.amount += t.type === "BUY" ? t.amount : -t.amount;
    const date = toDateInput(t.date);
    if (date > row.date) row.date = date;
    byInvestment.set(t.investmentId, row);
  }
  for (const [id, v] of byInvestment) {
    const amount = roundMoney(v.amount);
    const name = amount > 0 ? `${v.name} (bought)` : `${v.name} (sold)`;
    if (amount !== 0) items.push({ key: `v:${id}`, name, kind: "investment", amount, status: "paid", date: v.date });
  }

  const sum = (list: PlanItem[]) => roundMoney(list.reduce((a, i) => a + i.amount, 0));
  const fixedPaid = sum(items.filter((i) => i.status === "paid"));
  const fixedPending = sum(items.filter((i) => i.status !== "paid"));
  const fixedTotal = roundMoney(fixedPaid + fixedPending);
  const incomeTotal = roundMoney(income._sum.amount ?? 0);
  const billExpenses = roundMoney(paidBills.reduce((a, e) => a + e.amount, 0));
  const loanInterest = loanPaid.reduce((a, p) => a + (p.expenseId ? p.interestPart : 0), 0);
  const otherSpending = roundMoney((spent._sum.amount ?? 0) - billExpenses - (fundExpenses._sum.amount ?? 0) - loanInterest);

  return {
    label: monthLabel(year, month),
    income: incomeTotal,
    items,
    fixedPaid,
    fixedPending,
    fixedTotal,
    otherSpending,
    leftToSpend: roundMoney(incomeTotal - fixedTotal - otherSpending),
  };
}
