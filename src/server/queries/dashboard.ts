import "server-only";
import { db } from "@/lib/db";
import { CATEGORIES, type CategoryValue } from "@/lib/constants";
import {
  addDays,
  currentYearMonth,
  daysInMonth,
  diffInDays,
  formatExpenseDate,
  monthLabel,
  monthRange,
  type Period,
  periodLabel,
  shiftMonth,
  todayUTC,
  yearRange,
} from "@/lib/dates";
import { percentChange, roundMoney } from "@/lib/format";
import { periodWhere, toExpenseDTO } from "@/server/queries/expenses";
import type {
  CategorySlice,
  ComparisonPoint,
  DailyPoint,
  DashboardData,
  SummaryCard,
  TrendPoint,
} from "@/types";

type Row = { amount: number; date: Date; category: CategoryValue };

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const rowMonthKey = (d: Date) => monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);

function sum(rows: Row[]) {
  return roundMoney(rows.reduce((acc, r) => acc + r.amount, 0));
}

function inMonth(rows: Row[], year: number, month: number) {
  const key = monthKey(year, month);
  return rows.filter((r) => rowMonthKey(r.date) === key);
}

function buildTrend(rows: Row[], endYear: number, endMonth: number, selected: boolean): TrendPoint[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const key = rowMonthKey(r.date);
    totals.set(key, (totals.get(key) ?? 0) + r.amount);
  }
  return Array.from({ length: 12 }, (_, i) => {
    const { year, month } = shiftMonth(endYear, endMonth, i - 11);
    const key = monthKey(year, month);
    return {
      key,
      label: monthLabel(year, month, true).slice(0, 3),
      fullLabel: monthLabel(year, month),
      total: roundMoney(totals.get(key) ?? 0),
      isSelected: selected && i === 11,
    };
  });
}

function buildDailyForMonth(rows: Row[], year: number, month: number): DailyPoint[] {
  const days = daysInMonth(year, month);
  const totals = new Array<number>(days).fill(0);
  for (const r of inMonth(rows, year, month)) totals[r.date.getUTCDate() - 1] += r.amount;
  return totals.map((total, i) => ({
    day: i + 1,
    label: formatExpenseDate(new Date(Date.UTC(year, month - 1, i + 1)), {
      day: "numeric",
      month: "short",
    }),
    total: roundMoney(total),
  }));
}

function buildDailyRange(rows: Row[], start: Date, days: number): DailyPoint[] {
  const totals = new Array<number>(days).fill(0);
  for (const r of rows) {
    const idx = diffInDays(start, r.date);
    if (idx >= 0 && idx < days) totals[idx] += r.amount;
  }
  return totals.map((total, i) => {
    const d = addDays(start, i);
    return {
      day: d.getUTCDate(),
      label: formatExpenseDate(d, { day: "numeric", month: "short" }),
      total: roundMoney(total),
    };
  });
}

/** Cumulative spend by day-of-month for a month and the month before it. */
function buildComparison(rows: Row[], year: number, month: number) {
  const prev = shiftMonth(year, month, -1);
  const curDays = daysInMonth(year, month);
  const prevDays = daysInMonth(prev.year, prev.month);

  const today = todayUTC();
  const { year: cy, month: cm } = currentYearMonth();
  const isCurrent = cy === year && cm === month;
  const isFuture = year * 12 + month > cy * 12 + cm;
  const lastDayWithData = isFuture ? 0 : isCurrent ? today.getUTCDate() : curDays;

  const cumulative = (list: Row[], days: number) => {
    const daily = new Array<number>(days).fill(0);
    for (const r of list) daily[r.date.getUTCDate() - 1] += r.amount;
    let running = 0;
    return daily.map((v) => roundMoney((running += v)));
  };

  const cur = cumulative(inMonth(rows, year, month), curDays);
  const prv = cumulative(inMonth(rows, prev.year, prev.month), prevDays);

  const points: ComparisonPoint[] = Array.from({ length: Math.max(curDays, prevDays) }, (_, i) => ({
    day: i + 1,
    current: i < curDays && i < lastDayWithData ? cur[i] : null,
    previous: i < prevDays ? prv[i] : null,
  }));

  const currentTotal = cur[curDays - 1] ?? 0;
  const previousTotal = prv[prevDays - 1] ?? 0;

  return {
    currentLabel: monthLabel(year, month),
    previousLabel: monthLabel(prev.year, prev.month),
    currentTotal,
    previousTotal,
    change: percentChange(currentTotal, previousTotal),
    points,
  };
}

function buildSlices(totals: Map<CategoryValue, { total: number; count: number }>) {
  const grand = roundMoney([...totals.values()].reduce((a, b) => a + b.total, 0));
  const slices: CategorySlice[] = CATEGORIES.filter((c) => (totals.get(c)?.count ?? 0) > 0)
    .map((category) => {
      const { total, count } = totals.get(category)!;
      return {
        category,
        total: roundMoney(total),
        count,
        percent: grand > 0 ? (total / grand) * 100 : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
  return { total: grand, slices };
}

function slicesFromRows(rows: Row[]) {
  const totals = new Map<CategoryValue, { total: number; count: number }>();
  for (const r of rows) {
    const t = totals.get(r.category) ?? { total: 0, count: 0 };
    t.total += r.amount;
    t.count += 1;
    totals.set(r.category, t);
  }
  return buildSlices(totals);
}

async function sumBetween(userId: string, start: Date, end: Date) {
  const agg = await db.expense.aggregate({
    where: { userId, date: { gte: start, lt: end } },
    _sum: { amount: true },
  });
  return roundMoney(agg._sum.amount ?? 0);
}

async function fetchRows(userId: string, start: Date, end: Date): Promise<Row[]> {
  return db.expense.findMany({
    where: { userId, date: { gte: start, lt: end } },
    select: { amount: true, date: true, category: true },
  });
}

async function fetchRecent(userId: string, period: Period) {
  const rows = await db.expense.findMany({
    where: { userId, ...periodWhere(period) },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 6,
  });
  return rows.map(toExpenseDTO);
}

/** All figures are scoped to one user's expenses. */
export async function getDashboardData(userId: string, period: Period): Promise<DashboardData> {
  return period.kind === "month" ? getMonthDashboard(userId, period) : getAllTimeDashboard(userId);
}

async function getMonthDashboard(userId: string, period: Extract<Period, { kind: "month" }>): Promise<DashboardData> {
  const { year, month } = period;
  const now = currentYearMonth();
  const today = todayUTC();
  const isCurrent = now.year === year && now.month === month;
  const isFuture = year * 12 + month > now.year * 12 + now.month;
  const prev = shiftMonth(year, month, -1);

  // 12-month window ending at the selected month powers trend, daily,
  // comparison and category charts with a single query.
  const windowStart = monthRange(shiftMonth(year, month, -11).year, shiftMonth(year, month, -11).month).start;
  const windowEnd = monthRange(year, month).end;
  const yr = yearRange(year);

  const [rows, yearTotal, todayTotal, recent] = await Promise.all([
    fetchRows(userId, windowStart, windowEnd),
    sumBetween(userId, yr.start, yr.end),
    sumBetween(userId, today, addDays(today, 1)),
    fetchRecent(userId, period),
  ]);

  const monthRows = inMonth(rows, year, month);
  const monthTotal = sum(monthRows);
  const prevTotal = sum(inMonth(rows, prev.year, prev.month));
  const daysCounted = isCurrent ? today.getUTCDate() : daysInMonth(year, month);
  const avgDaily = isFuture ? 0 : roundMoney(monthTotal / daysCounted);

  const cards: SummaryCard[] = [
    {
      key: "month",
      label: isCurrent ? "This Month" : monthLabel(year, month),
      value: monthTotal,
      hint: `${monthRows.length} expense${monthRows.length === 1 ? "" : "s"}`,
      change: percentChange(monthTotal, prevTotal),
      changeLabel: `vs ${monthLabel(prev.year, prev.month, true)}`,
    },
    {
      key: "previous",
      label: isCurrent ? "Last Month" : "Previous Month",
      value: prevTotal,
      hint: monthLabel(prev.year, prev.month),
    },
    {
      key: "year",
      label: now.year === year ? "This Year" : `Year ${year}`,
      value: yearTotal,
      hint: `Jan – Dec ${year}`,
    },
    {
      key: "today",
      label: "Today",
      value: todayTotal,
      hint: formatExpenseDate(today, { weekday: "long", day: "numeric", month: "short" }),
    },
    {
      key: "avg",
      label: "Avg. Daily Spending",
      value: avgDaily,
      hint: isCurrent ? `Over ${daysCounted} day${daysCounted === 1 ? "" : "s"} so far` : `Over ${daysCounted} days`,
    },
  ];

  return {
    periodLabel: monthLabel(year, month),
    cards,
    trend: buildTrend(rows, year, month, true),
    daily: { title: `Daily spending · ${monthLabel(year, month)}`, points: buildDailyForMonth(rows, year, month) },
    comparison: buildComparison(rows, year, month),
    categories: slicesFromRows(monthRows),
    recent,
    expenseCount: monthRows.length,
  };
}

async function getAllTimeDashboard(userId: string): Promise<DashboardData> {
  const { year, month } = currentYearMonth();
  const today = todayUTC();
  const prev = shiftMonth(year, month, -1);
  const start = shiftMonth(year, month, -11);
  const windowStart = monthRange(start.year, start.month).start;
  const windowEnd = addDays(today, 1) > monthRange(year, month).end ? addDays(today, 1) : monthRange(year, month).end;
  const yr = yearRange(year);

  const [rows, allAgg, grouped, yearTotal, recent] = await Promise.all([
    fetchRows(userId, windowStart, windowEnd),
    db.expense.aggregate({ where: { userId }, _sum: { amount: true }, _count: { _all: true }, _min: { date: true } }),
    db.expense.groupBy({ by: ["category"], where: { userId }, _sum: { amount: true }, _count: { _all: true } }),
    sumBetween(userId, yr.start, yr.end),
    fetchRecent(userId, { kind: "all" }),
  ]);

  const allTotal = roundMoney(allAgg._sum.amount ?? 0);
  const count = allAgg._count._all;
  const monthTotal = sum(inMonth(rows, year, month));
  const prevTotal = sum(inMonth(rows, prev.year, prev.month));
  const todayTotal = sum(rows.filter((r) => r.date.getTime() === today.getTime()));
  const firstDate = allAgg._min.date;
  const spanDays = firstDate ? Math.max(1, diffInDays(firstDate, today) + 1) : 1;

  const totals = new Map<CategoryValue, { total: number; count: number }>();
  for (const g of grouped) totals.set(g.category, { total: g._sum.amount ?? 0, count: g._count._all });

  const last30Start = addDays(today, -29);

  const cards: SummaryCard[] = [
    {
      key: "all",
      label: "All-Time Total",
      value: allTotal,
      hint: `${count} expense${count === 1 ? "" : "s"} recorded`,
    },
    {
      key: "month",
      label: "This Month",
      value: monthTotal,
      hint: monthLabel(year, month),
      change: percentChange(monthTotal, prevTotal),
      changeLabel: `vs ${monthLabel(prev.year, prev.month, true)}`,
    },
    { key: "year", label: "This Year", value: yearTotal, hint: `Jan – Dec ${year}` },
    {
      key: "today",
      label: "Today",
      value: todayTotal,
      hint: formatExpenseDate(today, { weekday: "long", day: "numeric", month: "short" }),
    },
    {
      key: "avg",
      label: "Avg. Daily Spending",
      value: firstDate && firstDate <= today ? roundMoney(allTotal / spanDays) : 0,
      hint: firstDate ? `Since ${formatExpenseDate(firstDate)}` : "No expenses yet",
    },
  ];

  return {
    periodLabel: periodLabel({ kind: "all" }),
    cards,
    trend: buildTrend(rows, year, month, false),
    daily: { title: "Daily spending · Last 30 days", points: buildDailyRange(rows, last30Start, 30) },
    comparison: buildComparison(rows, year, month),
    categories: buildSlices(totals),
    recent,
    expenseCount: count,
  };
}
