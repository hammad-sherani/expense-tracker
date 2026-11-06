"use server";

import { refresh, revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { dateInputToUTC, todayInput } from "@/lib/dates";
import { formatCurrency, roundMoney } from "@/lib/format";
import { toPaisa } from "@/lib/split";
import { type ManualDueValues, manualDueSchema, type PaymentValues, paymentSchema } from "@/lib/validations/dues";
import { issuesToFieldErrors, objectIdSchema } from "@/lib/validations/expense";
import type { ActionResult } from "@/types";

function revalidateAll() {
  revalidatePath("/", "layout");
  refresh();
}

class DueError extends Error {}

/** Records a full or partial repayment of one due. */
export async function recordPayment(dueId: string, input: PaymentValues): Promise<ActionResult> {
  const idResult = objectIdSchema.safeParse(dueId);
  if (!idResult.success) return { ok: false, error: "Invalid due." };
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: issuesToFieldErrors(parsed.error) };
  }
  const user = await requireUser();
  const amount = roundMoney(Number(parsed.data.amount));

  try {
    await db.$transaction(async (tx) => {
      const due = await tx.due.findFirst({ where: { id: idResult.data, userId: user.id } });
      if (!due) throw new DueError("This due no longer exists.");
      const remainingPaisa = toPaisa(due.amount) - toPaisa(due.paidAmount);
      if (toPaisa(amount) > remainingPaisa) {
        throw new DueError(`Only ${formatCurrency(remainingPaisa / 100)} is left on this due.`);
      }
      await tx.duePayment.create({
        data: {
          userId: user.id,
          dueId: due.id,
          amount,
          date: dateInputToUTC(parsed.data.date),
          note: parsed.data.note || null,
        },
      });
      await tx.due.update({ where: { id: due.id }, data: { paidAmount: roundMoney(due.paidAmount + amount) } });
    });
    revalidateAll();
    return { ok: true, data: undefined, message: `Payment of ${formatCurrency(amount)} recorded` };
  } catch (error) {
    if (error instanceof DueError) return { ok: false, error: error.message, fieldErrors: { amount: [error.message] } };
    console.error("record payment failed", error);
    return { ok: false, error: "Couldn't record the payment. Please try again." };
  }
}

/** Marks every open due with a friend (in one direction) as fully paid today. */
export async function settleFriend(friendId: string, direction: "OWED_TO_ME" | "I_OWE"): Promise<ActionResult> {
  const idResult = objectIdSchema.safeParse(friendId);
  if (!idResult.success || (direction !== "OWED_TO_ME" && direction !== "I_OWE")) {
    return { ok: false, error: "Invalid request." };
  }
  const user = await requireUser();
  const today = dateInputToUTC(todayInput());

  try {
    const settled = await db.$transaction(async (tx) => {
      const dues = await tx.due.findMany({ where: { userId: user.id, friendId: idResult.data, direction } });
      let total = 0;
      for (const due of dues) {
        const remaining = roundMoney(due.amount - due.paidAmount);
        if (toPaisa(remaining) <= 0) continue;
        await tx.duePayment.create({
          data: { userId: user.id, dueId: due.id, amount: remaining, date: today, note: "Settled in full" },
        });
        await tx.due.update({ where: { id: due.id }, data: { paidAmount: due.amount } });
        total += remaining;
      }
      return roundMoney(total);
    });
    if (settled === 0) return { ok: false, error: "Nothing is pending with this friend." };
    revalidateAll();
    return { ok: true, data: undefined, message: `Settled ${formatCurrency(settled)}` };
  } catch (error) {
    console.error("settle friend failed", error);
    return { ok: false, error: "Couldn't settle up. Please try again." };
  }
}

/** Creates a standalone due (not an expense), e.g. paid fully for family. */
export async function createDue(input: ManualDueValues): Promise<ActionResult> {
  const parsed = manualDueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: issuesToFieldErrors(parsed.error) };
  }
  const user = await requireUser();

  try {
    const friend = await db.friend.findFirst({ where: { id: parsed.data.friendId, userId: user.id } });
    if (!friend) return { ok: false, error: "Choose a person first.", fieldErrors: { friendId: ["Choose a person"] } };

    const amount = roundMoney(Number(parsed.data.amount));
    await db.due.create({
      data: {
        userId: user.id,
        friendId: friend.id,
        expenseId: null,
        direction: parsed.data.direction,
        amount,
        description: parsed.data.description,
        date: dateInputToUTC(parsed.data.date),
      },
    });
    revalidateAll();
    return {
      ok: true,
      data: undefined,
      message:
        parsed.data.direction === "OWED_TO_ME"
          ? `${friend.name} owes you ${formatCurrency(amount)}`
          : `You owe ${friend.name} ${formatCurrency(amount)}`,
    };
  } catch (error) {
    console.error("create due failed", error);
    return { ok: false, error: "Couldn't save this due. Please try again." };
  }
}

/** Deletes a standalone due and its payments. Dues created by a split are managed through the expense. */
export async function deleteDue(dueId: string): Promise<ActionResult> {
  const idResult = objectIdSchema.safeParse(dueId);
  if (!idResult.success) return { ok: false, error: "Invalid due." };
  const user = await requireUser();

  try {
    const due = await db.due.findFirst({ where: { id: idResult.data, userId: user.id } });
    if (!due) return { ok: false, error: "This due no longer exists." };
    if (due.expenseId) return { ok: false, error: "This due belongs to a split expense. Edit or delete the expense instead." };
    await db.due.delete({ where: { id: due.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Due deleted" };
  } catch (error) {
    console.error("delete due failed", error);
    return { ok: false, error: "Couldn't delete this due." };
  }
}

/** Removes a recorded payment (undo). */
export async function deletePayment(paymentId: string): Promise<ActionResult> {
  const idResult = objectIdSchema.safeParse(paymentId);
  if (!idResult.success) return { ok: false, error: "Invalid payment." };
  const user = await requireUser();

  try {
    await db.$transaction(async (tx) => {
      const payment = await tx.duePayment.findFirst({
        where: { id: idResult.data, userId: user.id },
        include: { due: true },
      });
      if (!payment) throw new DueError("This payment no longer exists.");
      await tx.duePayment.delete({ where: { id: payment.id } });
      await tx.due.update({
        where: { id: payment.dueId },
        data: { paidAmount: Math.max(0, roundMoney(payment.due.paidAmount - payment.amount)) },
      });
    });
    revalidateAll();
    return { ok: true, data: undefined, message: "Payment removed" };
  } catch (error) {
    if (error instanceof DueError) return { ok: false, error: error.message };
    console.error("delete payment failed", error);
    return { ok: false, error: "Couldn't remove the payment." };
  }
}
