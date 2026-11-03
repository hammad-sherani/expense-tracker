"use server";

import { Prisma } from "@prisma/client";
import { refresh, revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { dateInputToUTC } from "@/lib/dates";
import { roundMoney } from "@/lib/format";
import {
  type ExpenseFormValues,
  expenseFormSchema,
  objectIdSchema,
} from "@/lib/validations/expense";
import { toExpenseDTO } from "@/server/queries/expenses";
import type { ActionResult, ExpenseDTO } from "@/types";

function toData(values: ExpenseFormValues) {
  return {
    amount: roundMoney(Number(values.amount)),
    description: values.description,
    date: dateInputToUTC(values.date),
    category: values.category,
    paymentMethod: values.paymentMethod === "" ? null : values.paymentMethod,
    notes: values.notes === "" ? null : values.notes,
  };
}

/** Make every page (dashboard + expenses) show fresh data after a mutation. */
function revalidateAll() {
  revalidatePath("/", "layout");
  refresh();
}

function failure(error: unknown, fallback: string): ActionResult<never> {
  console.error(fallback, error);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return { ok: false, error: "This expense no longer exists. It may have been deleted." };
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return { ok: false, error: "Could not connect to the database. Please try again." };
  }
  return { ok: false, error: fallback };
}

export async function createExpense(input: ExpenseFormValues): Promise<ActionResult<ExpenseDTO>> {
  const parsed = expenseFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();

  try {
    const expense = await db.expense.create({ data: { ...toData(parsed.data), userId: user.id } });
    revalidateAll();
    return { ok: true, data: toExpenseDTO(expense), message: "Expense added" };
  } catch (error) {
    return failure(error, "Failed to add expense.");
  }
}

export async function updateExpense(
  id: string,
  input: ExpenseFormValues,
): Promise<ActionResult<ExpenseDTO>> {
  const idResult = objectIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "Invalid expense id." };

  const parsed = expenseFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();

  try {
    // userId in the filter: a user can only ever change their own expenses.
    const expense = await db.expense.update({
      where: { id: idResult.data, userId: user.id },
      data: toData(parsed.data),
    });
    revalidateAll();
    return { ok: true, data: toExpenseDTO(expense), message: "Expense updated" };
  } catch (error) {
    return failure(error, "Failed to update expense.");
  }
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const idResult = objectIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "Invalid expense id." };

  const user = await requireUser();

  try {
    await db.expense.delete({ where: { id: idResult.data, userId: user.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Expense deleted" };
  } catch (error) {
    return failure(error, "Failed to delete expense.");
  }
}
