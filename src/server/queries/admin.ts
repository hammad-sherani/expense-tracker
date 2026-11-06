import "server-only";
import { db } from "@/lib/db";
import { addDays, formatExpenseDate, toDateInput, todayUTC } from "@/lib/dates";

export type SignupPoint = { date: string; label: string; count: number };

/** App-wide numbers for the admin overview. Counts only: no one's amounts or descriptions. */
export async function getAdminOverview() {
  const today = todayUTC();
  const since30 = addDays(today, -29);
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 86_400_000);
  const base = { role: "USER" as const };

  const [total, verified, blocked, active7, active30, recent, expenses, incomes, wallets, groups] = await Promise.all([
    db.user.count({ where: base }),
    db.user.count({ where: { ...base, emailVerified: { not: null } } }),
    db.user.count({ where: { ...base, blockedAt: { not: null } } }),
    db.user.count({ where: { ...base, lastActiveAt: { gte: days(7) } } }),
    db.user.count({ where: { ...base, lastActiveAt: { gte: days(30) } } }),
    db.user.findMany({ where: { ...base, createdAt: { gte: since30 } }, select: { createdAt: true } }),
    db.expense.count(),
    db.income.count(),
    db.wallet.count(),
    db.group.count(),
  ]);

  // Signups per day (calendar day in the app timezone) for the last 30 days.
  const counts = new Map<string, number>();
  for (const u of recent) {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Karachi",
    }).format(u.createdAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const signups: SignupPoint[] = Array.from({ length: 30 }, (_, i) => {
    const d = addDays(since30, i);
    const date = toDateInput(d);
    return { date, label: formatExpenseDate(d, { day: "numeric", month: "short" }), count: counts.get(date) ?? 0 };
  });

  return {
    users: { total, verified, unverified: total - verified, blocked, active7, active30 },
    signups,
    signups30: recent.length,
    entries: { expenses, incomes, wallets, groups },
  };
}

export async function getAdminUser(id: string) {
  const user = await db.user.findFirst({
    where: { id, role: "USER" },
    select: {
      id: true,
      username: true,
      email: true,
      emailVerified: true,
      blockedAt: true,
      lastActiveAt: true,
      createdAt: true,
    },
  });
  if (!user) return null;
  const where = { userId: id };
  const [expenses, incomes, wallets, categories, friends, groups, budgets, recurring] = await Promise.all([
    db.expense.count({ where }),
    db.income.count({ where }),
    db.wallet.count({ where }),
    db.category.count({ where }),
    db.friend.count({ where }),
    db.group.count({ where }),
    db.budget.count({ where }),
    db.recurringExpense.count({ where }),
  ]);
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    verified: Boolean(user.emailVerified),
    blocked: Boolean(user.blockedAt),
    blockedAt: user.blockedAt?.toISOString() ?? null,
    lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    counts: { expenses, incomes, wallets, categories, friends, groups, budgets, recurring },
  };
}
