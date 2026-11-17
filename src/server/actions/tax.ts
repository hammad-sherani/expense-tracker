"use server";

import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { dateInputToUTC } from "@/lib/dates";
import { roundMoney } from "@/lib/format";
import { objectId } from "@/lib/validations/money";
import {
  type ReminderValues,
  reminderSchema,
  taxTagSchema,
  type WithholdingValues,
  withholdingSchema,
} from "@/lib/validations/tax";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult } from "@/types";

const invalid = (e: import("zod").ZodError): ActionResult<never> => ({
  ok: false,
  error: "Please fix the highlighted fields.",
  fieldErrors: e.flatten().fieldErrors as Record<string, string[] | undefined>,
});
const gone = (what: string): ActionResult<never> => ({ ok: false, error: `This ${what} no longer exists.` });
const FROM_SALARY: ActionResult<never> = {
  ok: false,
  error: "This tax was deducted from a salary. Change it by editing that income.",
};

function withholdingData(v: WithholdingValues) {
  return {
    date: dateInputToUTC(v.date),
    type: v.type,
    section: v.section || null,
    amount: roundMoney(Number(v.amount)),
    adjustable: v.adjustable,
    note: v.note || null,
  };
}

export async function createWithholding(input: WithholdingValues): Promise<ActionResult> {
  const parsed = withholdingSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  try {
    await db.taxWithholding.create({ data: { userId: user.id, ...withholdingData(parsed.data) } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Tax deduction added" };
  } catch (e) {
    console.error("create withholding failed", e);
    return { ok: false, error: "Couldn't add this." };
  }
}

export async function updateWithholding(id: string, input: WithholdingValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return gone("entry");
  const parsed = withholdingSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  try {
    const row = await db.taxWithholding.findFirst({ where: { id, userId: user.id }, select: { incomeId: true } });
    if (!row) return gone("entry");
    if (row.incomeId) return FROM_SALARY;
    await db.taxWithholding.update({ where: { id }, data: withholdingData(parsed.data) });
    revalidateAll();
    return { ok: true, data: undefined, message: "Tax deduction updated" };
  } catch (e) {
    console.error("update withholding failed", e);
    return { ok: false, error: "Couldn't update this." };
  }
}

export async function deleteWithholding(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return gone("entry");
  const user = await requireUser();
  try {
    const row = await db.taxWithholding.findFirst({ where: { id, userId: user.id }, select: { incomeId: true } });
    if (!row) return gone("entry");
    if (row.incomeId) return FROM_SALARY;
    await db.taxWithholding.delete({ where: { id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Tax deduction removed" };
  } catch (e) {
    console.error("delete withholding failed", e);
    return { ok: false, error: "Couldn't remove this." };
  }
}

/** Which tax deduction or credit a category's expenses count towards ("" = none). */
export async function setCategoryTaxTag(categoryId: string, tag: string): Promise<ActionResult> {
  if (!objectId.safeParse(categoryId).success) return gone("category");
  const parsed = taxTagSchema.safeParse(tag);
  if (!parsed.success) return { ok: false, error: "Pick a valid option." };
  const user = await requireUser();
  try {
    const res = await db.category.updateMany({ where: { id: categoryId, userId: user.id }, data: { taxTag: parsed.data || null } });
    if (res.count === 0) return gone("category");
    revalidateAll();
    return { ok: true, data: undefined, message: "Category updated" };
  } catch (e) {
    console.error("set tax tag failed", e);
    return { ok: false, error: "Couldn't update this category." };
  }
}

/** Leaves one expense out of (or puts it back into) its category's tax deduction. */
export async function setExpenseTaxExcluded(expenseId: string, excluded: boolean): Promise<ActionResult> {
  if (!objectId.safeParse(expenseId).success) return gone("expense");
  const user = await requireUser();
  try {
    const res = await db.expense.updateMany({ where: { id: expenseId, userId: user.id }, data: { taxExcluded: excluded || null } });
    if (res.count === 0) return gone("expense");
    revalidateAll();
    return { ok: true, data: undefined, message: excluded ? "Left out of your tax" : "Counted in your tax" };
  } catch (e) {
    console.error("set tax excluded failed", e);
    return { ok: false, error: "Couldn't update this expense." };
  }
}

function reminderData(v: ReminderValues) {
  return { title: v.title, date: dateInputToUTC(v.date), yearly: v.yearly, notes: v.notes || null };
}

export async function createReminder(input: ReminderValues): Promise<ActionResult> {
  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  try {
    await db.reminder.create({ data: { userId: user.id, ...reminderData(parsed.data) } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Reminder added" };
  } catch (e) {
    console.error("create reminder failed", e);
    return { ok: false, error: "Couldn't add the reminder." };
  }
}

export async function updateReminder(id: string, input: ReminderValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return gone("reminder");
  const parsed = reminderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  try {
    const res = await db.reminder.updateMany({ where: { id, userId: user.id }, data: reminderData(parsed.data) });
    if (res.count === 0) return gone("reminder");
    revalidateAll();
    return { ok: true, data: undefined, message: "Reminder updated" };
  } catch (e) {
    console.error("update reminder failed", e);
    return { ok: false, error: "Couldn't update the reminder." };
  }
}

export async function deleteReminder(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return gone("reminder");
  const user = await requireUser();
  try {
    const res = await db.reminder.deleteMany({ where: { id, userId: user.id } });
    if (res.count === 0) return gone("reminder");
    revalidateAll();
    return { ok: true, data: undefined, message: "Reminder deleted" };
  } catch (e) {
    console.error("delete reminder failed", e);
    return { ok: false, error: "Couldn't delete the reminder." };
  }
}
