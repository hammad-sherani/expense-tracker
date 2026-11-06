import "server-only";
import { Prisma } from "@prisma/client";
import { after } from "next/server";
import { db } from "@/lib/db";
import { currentYearMonth, daysInMonth, monthLabel, monthRange, todayUTC } from "@/lib/dates";
import { noticeEmail, sendEmail } from "@/lib/email";
import { formatCurrency, roundMoney } from "@/lib/format";
import { toCategoryDTO } from "@/server/queries/expenses";
import type { CategoryDTO } from "@/types";

export type BudgetStatus = {
  id: string;
  /** null = overall budget for all spending. */
  category: CategoryDTO | null;
  amount: number;
  spent: number;
  remaining: number;
  percent: number;
  level: "ok" | "warn" | "over";
};

const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

function levelOf(percent: number): BudgetStatus["level"] {
  return percent >= 100 ? "over" : percent >= 80 ? "warn" : "ok";
}

/** Every budget with what's been spent against it in the given month. */
export async function getBudgetStatus(userId: string, year: number, month: number): Promise<BudgetStatus[]> {
  const range = monthRange(year, month);
  const [budgets, byCategory, total] = await Promise.all([
    db.budget.findMany({
      where: { userId },
      include: { category: { select: { id: true, name: true, icon: true, color: true, archivedAt: true } } },
    }),
    db.expense.groupBy({
      by: ["categoryId"],
      where: { userId, date: { gte: range.start, lt: range.end } },
      _sum: { amount: true },
    }),
    db.expense.aggregate({ where: { userId, date: { gte: range.start, lt: range.end } }, _sum: { amount: true } }),
  ]);
  const spentBy = new Map(byCategory.map((g) => [g.categoryId, g._sum.amount ?? 0]));

  return budgets
    .map((b) => {
      const spent = roundMoney(b.categoryId ? (spentBy.get(b.categoryId) ?? 0) : (total._sum.amount ?? 0));
      const percent = b.amount > 0 ? (spent / b.amount) * 100 : 0;
      return {
        id: b.id,
        category: b.category ? toCategoryDTO(b.category) : null,
        amount: b.amount,
        spent,
        remaining: roundMoney(b.amount - spent),
        percent,
        level: levelOf(percent),
      };
    })
    .sort((a, b) => (a.category === null ? -1 : b.category === null ? 1 : b.percent - a.percent));
}

/** Days left in the month including today (for "Rs. X/day left"). */
export function daysLeftInMonth(year: number, month: number) {
  const now = currentYearMonth();
  if (now.year !== year || now.month !== month) return 0;
  return daysInMonth(year, month) - todayUTC().getUTCDate() + 1;
}

/**
 * After expenses change, alerts once per month when a budget passes 80% and 100%:
 * returns short warnings for a toast and emails the user (after the response).
 * Only the current month is checked; editing old months shouldn't send emails.
 */
export async function checkBudgetAlerts(
  user: { id: string; email: string; username: string },
  changed: { categoryId: string | null; date: Date }[],
): Promise<string[]> {
  try {
    const { year, month } = currentYearMonth();
    const range = monthRange(year, month);
    const current = changed.filter((c) => c.date >= range.start && c.date < range.end);
    if (current.length === 0) return [];
    const ids = [...new Set(current.map((c) => c.categoryId).filter((x): x is string => Boolean(x)))];
    const budgets = await db.budget.findMany({
      where: {
        userId: user.id,
        OR: [{ categoryId: { in: ids } }, { categoryId: null }, { categoryId: { isSet: false } }],
      },
    });
    if (budgets.length === 0) return [];

    const status = await getBudgetStatus(user.id, year, month);
    const key = monthKey(year, month);
    const warnings: string[] = [];
    const emails: { title: string; lines: string[] }[] = [];

    for (const b of budgets) {
      const s = status.find((x) => x.id === b.id);
      if (!s || s.percent < 80) continue;
      const name = s.category ? s.category.name : "overall";
      // Record both levels that were reached; announce only the highest new one.
      let announced: 80 | 100 | null = null;
      for (const level of [100, 80] as const) {
        if (s.percent < level) continue;
        try {
          await db.budgetAlert.create({ data: { budgetId: b.id, month: key, level } });
          announced ??= level;
        } catch (e) {
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
        }
      }
      if (!announced) continue;
      const msg =
        announced === 100
          ? `You've gone over your ${name} budget: ${formatCurrency(s.spent)} of ${formatCurrency(s.amount)}.`
          : `You've used ${Math.floor(s.percent)}% of your ${name} budget (${formatCurrency(s.remaining)} left).`;
      warnings.push(msg);
      emails.push({
        title: announced === 100 ? `Over budget: ${name}` : `Budget alert: ${name} at ${Math.floor(s.percent)}%`,
        lines: [`Hi ${user.username},`, msg, `This is for ${monthLabel(year, month)}. Open Spendwise to see your budgets.`],
      });
    }

    if (emails.length) {
      after(async () => {
        for (const e of emails) {
          try {
            await sendEmail({ to: user.email, ...noticeEmail(e.title, e.lines) });
          } catch (err) {
            console.error("budget alert email failed", err);
          }
        }
      });
    }
    return warnings;
  } catch (e) {
    // Alerts must never break saving an expense.
    console.error("budget alert check failed", e);
    return [];
  }
}
