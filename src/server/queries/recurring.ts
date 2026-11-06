import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addDays, diffInDays, toDateInput, todayUTC } from "@/lib/dates";
import type { FrequencyValue } from "@/lib/recurrence";
import { toCategoryDTO, toWalletRef } from "@/server/queries/expenses";
import type { CategoryDTO, WalletRef } from "@/types";

export type RecurringStatus = "overdue" | "today" | "soon" | "later" | "paused" | "ended";

export type RecurringDTO = {
  id: string;
  description: string;
  amount: number;
  category: CategoryDTO | null;
  wallet: WalletRef | null;
  frequency: FrequencyValue;
  interval: number;
  startDate: string;
  nextDate: string;
  endDate: string | null;
  notes: string | null;
  active: boolean;
  status: RecurringStatus;
  /** Days from today to the next due date (negative = overdue). */
  daysUntil: number;
};

const include = {
  category: { select: { id: true, name: true, icon: true, color: true, archivedAt: true } },
  wallet: { select: { id: true, name: true, type: true, color: true } },
} satisfies Prisma.RecurringExpenseInclude;

export const UPCOMING_DAYS = 7;

function toDTO(r: Prisma.RecurringExpenseGetPayload<{ include: typeof include }>, today: Date): RecurringDTO {
  const daysUntil = diffInDays(today, r.nextDate);
  const ended = r.endDate !== null && r.nextDate > r.endDate;
  const status: RecurringStatus = ended
    ? "ended"
    : !r.active
      ? "paused"
      : daysUntil < 0
        ? "overdue"
        : daysUntil === 0
          ? "today"
          : daysUntil <= UPCOMING_DAYS
            ? "soon"
            : "later";
  return {
    id: r.id,
    description: r.description,
    amount: r.amount,
    category: r.category ? toCategoryDTO(r.category) : null,
    wallet: toWalletRef(r.wallet),
    frequency: r.frequency,
    interval: r.interval,
    startDate: toDateInput(r.startDate),
    nextDate: toDateInput(r.nextDate),
    endDate: r.endDate ? toDateInput(r.endDate) : null,
    notes: r.notes,
    active: r.active && !ended,
    status,
    daysUntil,
  };
}

export async function listRecurring(userId: string): Promise<RecurringDTO[]> {
  const today = todayUTC();
  const rows = await db.recurringExpense.findMany({ where: { userId }, include, orderBy: { nextDate: "asc" } });
  const order: Record<RecurringStatus, number> = { overdue: 0, today: 1, soon: 2, later: 3, paused: 4, ended: 5 };
  return rows.map((r) => toDTO(r, today)).sort((a, b) => order[a.status] - order[b.status] || a.daysUntil - b.daysUntil);
}

/** Active bills that are overdue or due within the next week. */
export async function upcomingBills(userId: string): Promise<RecurringDTO[]> {
  const today = todayUTC();
  const rows = await db.recurringExpense.findMany({
    where: { userId, active: true, nextDate: { lte: addDays(today, UPCOMING_DAYS) } },
    include,
    orderBy: { nextDate: "asc" },
  });
  return rows.map((r) => toDTO(r, today)).filter((r) => r.status !== "ended");
}

/** Number of bills due today or overdue (sidebar badge). */
export async function dueBillCount(userId: string) {
  const today = todayUTC();
  const rows = await db.recurringExpense.findMany({
    where: { userId, active: true, nextDate: { lte: today } },
    select: { nextDate: true, endDate: true },
  });
  return rows.filter((r) => r.endDate === null || r.nextDate <= r.endDate).length;
}
