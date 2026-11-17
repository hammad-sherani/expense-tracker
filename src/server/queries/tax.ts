import "server-only";
import { db } from "@/lib/db";
import { toDateInput, todayUTC } from "@/lib/dates";
import { roundMoney } from "@/lib/format";
import { rulesFor, type TaxRules, type TaxTagValue, type WithholdingTypeValue } from "@/lib/tax-rates";
import { taxYearOf, taxYearRange } from "@/lib/tax-year";

export type WithholdingDTO = {
  id: string;
  date: string;
  type: WithholdingTypeValue;
  section: string | null;
  amount: number;
  adjustable: boolean;
  note: string | null;
  /** Deducted from this salary (edit it there). */
  income: { id: string; source: string } | null;
};

export type DeductionRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  excluded: boolean;
};

export type TaxYearData = {
  taxYear: number;
  currentTaxYear: number;
  years: number[];
  rules: TaxRules;
  confirmed: boolean;
  /** Gross salary (received + tax deducted) per month of the tax year, July first. */
  salaryByMonth: { gross: number; withheld: number; recorded: boolean }[];
  salaryToDate: number;
  employerTaxToDate: number;
  /** Average of the last 3 months with salary, to project the rest of the year. */
  avgGross: number;
  avgWithheld: number;
  /** Months of this tax year (from the current one) with no salary recorded yet. */
  salaryMonthsLeft: number;
  withholdings: WithholdingDTO[];
  /** Adjustable tax deducted other than from salary. */
  otherAdjustable: number;
  finalTax: number;
  deductions: Record<TaxTagValue, DeductionRow[]>;
  categories: { id: string; name: string; taxTag: TaxTagValue | null; archived: boolean }[];
};

const DONATION_NAMES = ["charity", "donation", "donations", "sadqa", "sadaqah", "sadqah", "khairat"];

/**
 * Tags charity and zakat categories the first time, by name. A category the user has
 * set themselves (even to "not tax related", stored as null) is never touched.
 */
async function defaultTags(userId: string) {
  await db.category.updateMany({ where: { userId, nameKey: { in: DONATION_NAMES }, taxTag: { isSet: false } }, data: { taxTag: "DONATION" } });
  await db.category.updateMany({ where: { userId, nameKey: "zakat", taxTag: { isSet: false } }, data: { taxTag: "ZAKAT" } });
}

export async function getTaxYearData(userId: string, requested?: number): Promise<TaxYearData> {
  const today = todayUTC();
  const currentTaxYear = taxYearOf(today);
  await defaultTags(userId);

  const [firstIncome, firstExpense] = await Promise.all([
    db.income.findFirst({ where: { userId }, orderBy: { date: "asc" }, select: { date: true } }),
    db.expense.findFirst({ where: { userId }, orderBy: { date: "asc" }, select: { date: true } }),
  ]);
  const firstDates = [firstIncome?.date, firstExpense?.date].filter((d): d is Date => Boolean(d));
  const earliest = firstDates.length ? Math.min(...firstDates.map(taxYearOf)) : currentTaxYear;
  const years = Array.from({ length: Math.max(1, currentTaxYear - earliest + 1) }, (_, i) => currentTaxYear - i);
  const taxYear = requested && years.includes(requested) ? requested : currentTaxYear;
  const { start, end } = taxYearRange(taxYear);
  const inYear = { userId, date: { gte: start, lt: end } };

  const [salaries, withholdingRows, categories] = await Promise.all([
    db.income.findMany({
      where: { ...inYear, type: "SALARY" },
      select: { amount: true, date: true, withholdings: { select: { amount: true } } },
    }),
    db.taxWithholding.findMany({
      where: inYear,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { income: { select: { id: true, source: true } } },
    }),
    db.category.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, taxTag: true, archivedAt: true },
    }),
  ]);

  const tagged = categories.filter((c) => c.taxTag);
  const expenses = tagged.length
    ? await db.expense.findMany({
        where: { ...inYear, categoryId: { in: tagged.map((c) => c.id) } },
        orderBy: { date: "desc" },
        select: { id: true, date: true, description: true, amount: true, categoryId: true, taxExcluded: true },
      })
    : [];

  const monthIndex = (d: Date) => (d.getUTCFullYear() - start.getUTCFullYear()) * 12 + d.getUTCMonth() - 6;
  const salaryByMonth = Array.from({ length: 12 }, () => ({ gross: 0, withheld: 0, recorded: false }));
  for (const s of salaries) {
    const m = salaryByMonth[monthIndex(s.date)];
    const tax = s.withholdings.reduce((a, w) => a + w.amount, 0);
    m.gross += s.amount + tax;
    m.withheld += tax;
    m.recorded = true;
  }
  for (const m of salaryByMonth) {
    m.gross = roundMoney(m.gross);
    m.withheld = roundMoney(m.withheld);
  }
  const recorded = salaryByMonth.filter((m) => m.recorded);
  const last3 = recorded.slice(-3);
  const avg = (f: (m: (typeof recorded)[number]) => number) => (last3.length ? roundMoney(last3.reduce((a, m) => a + f(m), 0) / last3.length) : 0);

  // Months from the current one to June that still have no salary recorded (none for a past year).
  const fromMonth = taxYear < currentTaxYear ? 12 : taxYear > currentTaxYear ? 0 : monthIndex(today);
  const salaryMonthsLeft = salaryByMonth.slice(fromMonth).filter((m) => !m.recorded).length;

  const withholdings: WithholdingDTO[] = withholdingRows.map((w) => ({
    id: w.id,
    date: toDateInput(w.date),
    type: w.type,
    section: w.section,
    amount: w.amount,
    adjustable: w.adjustable,
    note: w.note,
    income: w.income,
  }));
  const sum = (list: { amount: number }[]) => roundMoney(list.reduce((a, w) => a + w.amount, 0));
  const catName = new Map(categories.map((c) => [c.id, c]));
  const deductions: Record<TaxTagValue, DeductionRow[]> = { DONATION: [], ZAKAT: [], PENSION: [] };
  for (const e of expenses) {
    const c = catName.get(e.categoryId!);
    if (!c?.taxTag) continue;
    deductions[c.taxTag].push({
      id: e.id,
      date: toDateInput(e.date),
      description: e.description,
      amount: e.amount,
      category: c.name,
      excluded: Boolean(e.taxExcluded),
    });
  }

  const { rules, confirmed } = rulesFor(taxYear);
  return {
    taxYear,
    currentTaxYear,
    years,
    rules,
    confirmed,
    salaryByMonth,
    salaryToDate: roundMoney(recorded.reduce((a, m) => a + m.gross, 0)),
    employerTaxToDate: roundMoney(recorded.reduce((a, m) => a + m.withheld, 0)),
    avgGross: avg((m) => m.gross),
    avgWithheld: avg((m) => m.withheld),
    salaryMonthsLeft,
    withholdings,
    otherAdjustable: sum(withholdings.filter((w) => w.adjustable && !w.income)),
    finalTax: sum(withholdings.filter((w) => !w.adjustable)),
    deductions,
    categories: categories.map((c) => ({ id: c.id, name: c.name, taxTag: c.taxTag, archived: Boolean(c.archivedAt) })),
  };
}
