import "server-only";
import { db } from "@/lib/db";
import { daysInMonth, monthLabel, monthRange, shiftMonth, toDateInput } from "@/lib/dates";
import { percentChange, roundMoney } from "@/lib/format";
import { toCategoryDTO } from "@/server/queries/expenses";
import type { CategoryDTO } from "@/types";

export type CategoryChange = {
  category: CategoryDTO;
  current: number;
  previous: number;
  /** % change; null when last month was 0. */
  change: number | null;
};

export type TrendSeries = { key: string; name: string; color: string };
export type TrendRow = { label: string; fullLabel: string } & Record<string, number | string>;

export type HeatDay = { date: string; day: number; weekday: number; total: number; count: number };

export type Unusual = { kind: "category" | "expense"; title: string; detail: string; amount: number };

export type TopPlace = { name: string; count: number; total: number };

export type Insights = {
  label: string;
  previousLabel: string;
  total: number;
  previousTotal: number;
  change: number | null;
  comparison: CategoryChange[];
  trend: { series: TrendSeries[]; rows: TrendRow[] };
  heatmap: { days: HeatDay[]; max: number; biggest: HeatDay | null; activeDays: number };
  unusual: Unusual[];
  top: TopPlace[];
};

const MONTHS = 6;
const TOP_SERIES = 5;
const key = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function getInsights(userId: string, year: number, month: number): Promise<Insights> {
  const first = shiftMonth(year, month, -(MONTHS - 1));
  const start = monthRange(first.year, first.month).start;
  const end = monthRange(year, month).end;
  const [rows, cats] = await Promise.all([
    db.expense.findMany({
      where: { userId, date: { gte: start, lt: end } },
      select: { amount: true, date: true, categoryId: true, legacyCategory: true, description: true },
    }),
    db.category.findMany({
      where: { userId },
      select: { id: true, name: true, icon: true, color: true, archivedAt: true },
    }),
  ]);
  const lookup = new Map(cats.map((c) => [c.id, toCategoryDTO(c)]));
  const catOf = (r: (typeof rows)[number]) =>
    (r.categoryId && lookup.get(r.categoryId)) || toCategoryDTO(null, r.legacyCategory);
  const catKey = (c: CategoryDTO) => c.id || `name:${c.name}`;
  const monthOf = (d: Date) => key(d.getUTCFullYear(), d.getUTCMonth() + 1);

  const months = Array.from({ length: MONTHS }, (_, i) => shiftMonth(first.year, first.month, i));
  const curKey = key(year, month);
  const prev = shiftMonth(year, month, -1);
  const prevKey = key(prev.year, prev.month);

  // totals[categoryKey][monthKey]
  const totals = new Map<string, Map<string, number>>();
  const categories = new Map<string, CategoryDTO>();
  for (const r of rows) {
    const c = catOf(r);
    const ck = catKey(c);
    categories.set(ck, c);
    const m = totals.get(ck) ?? new Map<string, number>();
    m.set(monthOf(r.date), (m.get(monthOf(r.date)) ?? 0) + r.amount);
    totals.set(ck, m);
  }
  const get = (ck: string, mk: string) => totals.get(ck)?.get(mk) ?? 0;

  // Month vs previous month, by category
  const comparison: CategoryChange[] = [...categories.entries()]
    .map(([ck, category]) => {
      const current = roundMoney(get(ck, curKey));
      const previous = roundMoney(get(ck, prevKey));
      return { category, current, previous, change: percentChange(current, previous) };
    })
    .filter((c) => c.current > 0 || c.previous > 0)
    .sort((a, b) => b.current - a.current || b.previous - a.previous);

  const monthTotal = (mk: string) => roundMoney([...totals.values()].reduce((a, m) => a + (m.get(mk) ?? 0), 0));
  const total = monthTotal(curKey);
  const previousTotal = monthTotal(prevKey);

  // 6-month trend: top categories keep their colour, the rest fold into "Other".
  const ranked = [...categories.keys()].sort(
    (a, b) => months.reduce((s, m) => s + get(b, key(m.year, m.month)), 0) - months.reduce((s, m) => s + get(a, key(m.year, m.month)), 0),
  );
  const shown = ranked.slice(0, TOP_SERIES);
  const folded = ranked.slice(TOP_SERIES);
  const series: TrendSeries[] = shown.map((ck, i) => ({ key: `s${i}`, name: categories.get(ck)!.name, color: categories.get(ck)!.color }));
  if (folded.length) series.push({ key: "other", name: "Everything else", color: "#94a3b8" });
  const trendRows: TrendRow[] = months.map((m) => {
    const mk = key(m.year, m.month);
    const row: TrendRow = { label: monthLabel(m.year, m.month, true).slice(0, 3), fullLabel: monthLabel(m.year, m.month) };
    shown.forEach((ck, i) => (row[`s${i}`] = roundMoney(get(ck, mk))));
    if (folded.length) row.other = roundMoney(folded.reduce((s, ck) => s + get(ck, mk), 0));
    return row;
  });

  // Calendar heatmap for the selected month
  const dim = daysInMonth(year, month);
  const days: HeatDay[] = Array.from({ length: dim }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1, i + 1));
    return { date: toDateInput(d), day: i + 1, weekday: (d.getUTCDay() + 6) % 7, total: 0, count: 0 };
  });
  const thisMonth = rows.filter((r) => monthOf(r.date) === curKey);
  for (const r of thisMonth) {
    const d = days[r.date.getUTCDate() - 1];
    d.total = roundMoney(d.total + r.amount);
    d.count += 1;
  }
  const max = Math.max(0, ...days.map((d) => d.total));
  const biggest = max > 0 ? days.find((d) => d.total === max)! : null;

  // Unusual spending
  const unusual: Unusual[] = [];
  for (const [ck, c] of categories) {
    const current = get(ck, curKey);
    const past = [1, 2, 3].map((n) => {
      const m = shiftMonth(year, month, -n);
      return get(ck, key(m.year, m.month));
    });
    const avg = past.reduce((a, b) => a + b, 0) / 3;
    if (avg > 0 && current > avg * 1.5 && current - avg >= 500) {
      unusual.push({
        kind: "category",
        title: `${c.name} is up ${Math.round((current / avg - 1) * 100)}%`,
        detail: `${monthLabel(year, month)} vs your 3-month average of Rs. ${Math.round(avg).toLocaleString("en-PK")}`,
        amount: roundMoney(current),
      });
    }
  }
  const amountsByCat = new Map<string, number[]>();
  for (const r of rows) {
    const ck = catKey(catOf(r));
    amountsByCat.set(ck, [...(amountsByCat.get(ck) ?? []), r.amount]);
  }
  for (const r of thisMonth) {
    const c = catOf(r);
    const list = amountsByCat.get(catKey(c)) ?? [];
    if (list.length < 4) continue;
    const med = median(list);
    if (r.amount >= 1000 && r.amount > med * 3) {
      unusual.push({
        kind: "expense",
        title: `Large ${c.name.toLowerCase()} expense: ${r.description}`,
        detail: `${Math.round(r.amount / med)}× your usual ${c.name} spend on ${toDateInput(r.date).slice(8)} ${monthLabel(year, month, true).slice(0, 3)}`,
        amount: roundMoney(r.amount),
      });
    }
  }
  unusual.sort((a, b) => b.amount - a.amount);

  // Top descriptions this month
  const places = new Map<string, TopPlace>();
  for (const r of thisMonth) {
    const name = r.description.trim().replace(/\s+/g, " ");
    const k = name.toLowerCase();
    const p = places.get(k) ?? { name, count: 0, total: 0 };
    p.count += 1;
    p.total = roundMoney(p.total + r.amount);
    places.set(k, p);
  }
  const top = [...places.values()].sort((a, b) => b.total - a.total).slice(0, 8);

  return {
    label: monthLabel(year, month),
    previousLabel: monthLabel(prev.year, prev.month),
    total,
    previousTotal,
    change: percentChange(total, previousTotal),
    comparison,
    trend: { series, rows: trendRows },
    heatmap: { days, max, biggest, activeDays: days.filter((d) => d.count > 0).length },
    unusual: unusual.slice(0, 6),
    top,
  };
}
