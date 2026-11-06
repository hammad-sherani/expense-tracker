"use server";

import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { dateInputToUTC, formatExpenseDate, todayUTC } from "@/lib/dates";
import { roundMoney } from "@/lib/format";
import { nextOccurrence } from "@/lib/recurrence";
import { objectId, type RecurringValues, recurringSchema } from "@/lib/validations/money";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult } from "@/types";

const invalid = (e: import("zod").ZodError): ActionResult<never> => ({
  ok: false,
  error: "Please fix the highlighted fields.",
  fieldErrors: e.flatten().fieldErrors as Record<string, string[] | undefined>,
});

async function refsOk(userId: string, categoryId: string, walletId: string) {
  const [c, w] = await Promise.all([
    db.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } }),
    walletId ? db.wallet.findFirst({ where: { id: walletId, userId }, select: { id: true } }) : true,
  ]);
  return Boolean(c && w);
}

export async function createRecurring(input: RecurringValues): Promise<ActionResult> {
  const parsed = recurringSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  if (!(await refsOk(user.id, v.categoryId, v.walletId))) return { ok: false, error: "Choose your category and wallet again." };
  const start = dateInputToUTC(v.startDate);
  try {
    await db.recurringExpense.create({
      data: {
        userId: user.id,
        description: v.description,
        amount: roundMoney(Number(v.amount)),
        categoryId: v.categoryId,
        walletId: v.walletId || null,
        frequency: v.frequency,
        interval: v.interval,
        startDate: start,
        nextDate: start,
        endDate: v.endDate ? dateInputToUTC(v.endDate) : null,
        notes: v.notes || null,
      },
    });
    revalidateAll();
    return { ok: true, data: undefined, message: `"${v.description}" added. First due ${formatExpenseDate(start)}.` };
  } catch (e) {
    console.error("create recurring failed", e);
    return { ok: false, error: "Couldn't save the recurring bill." };
  }
}

export async function updateRecurring(id: string, input: RecurringValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid bill." };
  const parsed = recurringSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  if (!(await refsOk(user.id, v.categoryId, v.walletId))) return { ok: false, error: "Choose your category and wallet again." };
  try {
    const rule = await db.recurringExpense.findFirst({ where: { id, userId: user.id } });
    if (!rule) return { ok: false, error: "This bill no longer exists." };
    const start = dateInputToUTC(v.startDate);
    const scheduleChanged =
      start.getTime() !== rule.startDate.getTime() || v.frequency !== rule.frequency || v.interval !== rule.interval;
    // A new schedule restarts from its first due date that isn't before the bill's current next date.
    let nextDate = rule.nextDate;
    if (scheduleChanged) {
      nextDate = start;
      if (rule.nextDate > start) {
        const prev = new Date(rule.nextDate.getTime() - 86_400_000);
        nextDate = nextOccurrence(start, v.frequency, v.interval, prev);
      }
    }
    await db.recurringExpense.update({
      where: { id: rule.id },
      data: {
        description: v.description,
        amount: roundMoney(Number(v.amount)),
        categoryId: v.categoryId,
        walletId: v.walletId || null,
        frequency: v.frequency,
        interval: v.interval,
        startDate: start,
        nextDate,
        endDate: v.endDate ? dateInputToUTC(v.endDate) : null,
        notes: v.notes || null,
      },
    });
    revalidateAll();
    return { ok: true, data: undefined, message: "Recurring bill updated" };
  } catch (e) {
    console.error("update recurring failed", e);
    return { ok: false, error: "Couldn't update the recurring bill." };
  }
}

/** Moves a bill to its next due date without recording an expense. */
export async function skipRecurring(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid bill." };
  const user = await requireUser();
  try {
    const rule = await db.recurringExpense.findFirst({ where: { id, userId: user.id } });
    if (!rule) return { ok: false, error: "This bill no longer exists." };
    const next = nextOccurrence(rule.startDate, rule.frequency, rule.interval, rule.nextDate);
    const finished = rule.endDate !== null && next > rule.endDate;
    await db.recurringExpense.update({ where: { id }, data: { nextDate: next, active: finished ? false : rule.active } });
    revalidateAll();
    return {
      ok: true,
      data: undefined,
      message: finished ? `Skipped. "${rule.description}" has ended.` : `Skipped. Next due ${formatExpenseDate(next)}.`,
    };
  } catch (e) {
    console.error("skip recurring failed", e);
    return { ok: false, error: "Couldn't skip this bill." };
  }
}

/** Pausing keeps the bill but hides it from upcoming bills. Resuming jumps past missed dates. */
export async function setRecurringActive(id: string, active: boolean): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid bill." };
  const user = await requireUser();
  try {
    const rule = await db.recurringExpense.findFirst({ where: { id, userId: user.id } });
    if (!rule) return { ok: false, error: "This bill no longer exists." };
    let nextDate = rule.nextDate;
    const today = todayUTC();
    if (active && nextDate < today) {
      nextDate = nextOccurrence(rule.startDate, rule.frequency, rule.interval, new Date(today.getTime() - 86_400_000));
    }
    if (active && rule.endDate && nextDate > rule.endDate) {
      return { ok: false, error: "This bill's end date has passed. Edit the end date first." };
    }
    await db.recurringExpense.update({ where: { id }, data: { active, nextDate } });
    revalidateAll();
    return { ok: true, data: undefined, message: active ? `Resumed. Next due ${formatExpenseDate(nextDate)}.` : "Paused" };
  } catch (e) {
    console.error("toggle recurring failed", e);
    return { ok: false, error: "Couldn't update this bill." };
  }
}

export async function deleteRecurring(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid bill." };
  const user = await requireUser();
  try {
    // Expenses already paid for it stay; they just lose the link.
    await db.recurringExpense.delete({ where: { id, userId: user.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Recurring bill deleted" };
  } catch (e) {
    console.error("delete recurring failed", e);
    return { ok: false, error: "Couldn't delete this bill." };
  }
}
