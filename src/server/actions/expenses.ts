"use server";

import { Prisma } from "@prisma/client";
import { refresh, revalidatePath } from "next/cache";
import { nextOccurrence } from "@/lib/recurrence";
import { checkBudgetAlerts } from "@/server/budgets";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { dateInputToUTC } from "@/lib/dates";
import { formatCurrency, roundMoney } from "@/lib/format";
import { type PlannedDue, planSplit, toPaisa } from "@/lib/split";
import {
  type ExpenseFormValues,
  expenseFormSchema,
  issuesToFieldErrors,
  objectIdSchema,
} from "@/lib/validations/expense";
import { expenseInclude, toExpenseDTO } from "@/server/queries/expenses";
import type { ActionResult, ExpenseDTO } from "@/types";

type Tx = Prisma.TransactionClient;

/** A split change that would break recorded repayments. Shown on the split section of the form. */
class SplitConflict extends Error {}

function toPlan(values: ExpenseFormValues) {
  const base = {
    description: values.description,
    date: dateInputToUTC(values.date),
    categoryId: values.categoryId,
    walletId: values.walletId === "" ? null : values.walletId,
    groupId: values.groupId === "" ? null : values.groupId,
    notes: values.notes === "" ? null : values.notes,
  };

  if (!values.split.enabled) {
    return {
      data: {
        ...base,
        amount: roundMoney(Number(values.amount)),
        splitTotal: null,
        paidByFriendId: null,
        shares: [] as { friendId: string | null; amount: number }[],
      },
      dues: [] as PlannedDue[],
      dueDate: null,
    };
  }

  const plan = planSplit({
    total: Number(values.amount),
    myShare: Number(values.split.myShare),
    paidBy: values.split.paidBy,
    participants: values.split.participants.map((p) => ({ friendId: p.friendId, share: Number(p.share) })),
  });
  return {
    data: {
      ...base,
      amount: roundMoney(plan.expenseAmount),
      splitTotal: roundMoney(plan.splitTotal),
      paidByFriendId: plan.paidByFriendId,
      // Everyone's share, so groups can work out who owes whom (even between friends).
      shares: [
        { friendId: null, amount: roundMoney(Number(values.split.myShare)) },
        ...values.split.participants.map((p) => ({ friendId: p.friendId, amount: roundMoney(Number(p.share)) })),
      ],
    },
    dues: plan.dues.map((d) => ({ ...d, amount: roundMoney(d.amount) })),
    dueDate: values.split.dueDate ? dateInputToUTC(values.split.dueDate) : null,
  };
}

class FieldConflict extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

/** The category, wallet and group must belong to the signed-in user. */
async function assertOwnRefs(tx: Tx, userId: string, values: ExpenseFormValues) {
  const [category, wallet, group] = await Promise.all([
    tx.category.findFirst({ where: { id: values.categoryId, userId }, select: { id: true } }),
    values.walletId ? tx.wallet.findFirst({ where: { id: values.walletId, userId }, select: { id: true } }) : true,
    values.groupId ? tx.group.findFirst({ where: { id: values.groupId, userId }, select: { id: true } }) : true,
  ]);
  if (!category) throw new FieldConflict("categoryId", "This category no longer exists. Please pick another.");
  if (!wallet) throw new FieldConflict("walletId", "This wallet no longer exists. Please pick another.");
  if (!group) throw new FieldConflict("groupId", "This group no longer exists.");
}

/** Every friend in the split must belong to the signed-in user. */
async function assertOwnFriends(tx: Tx, userId: string, values: ExpenseFormValues) {
  await assertOwnRefs(tx, userId, values);
  if (!values.split.enabled) return;
  const ids = [...new Set(values.split.participants.map((p) => p.friendId))];
  const count = await tx.friend.count({ where: { userId, id: { in: ids } } });
  if (count !== ids.length) throw new SplitConflict("One of the selected friends no longer exists. Please re-select.");
}

/**
 * Brings an expense's dues in line with the planned split while keeping
 * repayments that were already recorded.
 */
async function syncDues(tx: Tx, userId: string, expenseId: string, planned: PlannedDue[], dueDate: Date | null) {
  const existing = await tx.due.findMany({
    where: { userId, expenseId },
    include: { friend: { select: { name: true } } },
  });
  const key = (friendId: string, direction: string) => `${friendId}:${direction}`;
  const plannedByKey = new Map(planned.map((d) => [key(d.friendId, d.direction), d]));

  for (const due of existing) {
    const next = plannedByKey.get(key(due.friendId, due.direction));
    if (next) {
      if (toPaisa(next.amount) < toPaisa(due.paidAmount)) {
        throw new SplitConflict(
          `${due.friend.name} has already paid ${formatCurrency(due.paidAmount)}, so their share can't be less than that.`,
        );
      }
      if (toPaisa(next.amount) !== toPaisa(due.amount) || due.dueDate?.getTime() !== dueDate?.getTime()) {
        await tx.due.update({ where: { id: due.id }, data: { amount: next.amount, dueDate } });
      }
      plannedByKey.delete(key(due.friendId, due.direction));
    } else {
      if (due.paidAmount > 0) {
        throw new SplitConflict(
          `${due.friend.name} has already paid ${formatCurrency(due.paidAmount)} for this bill. Remove those payments on the Dues page before taking them out of the split.`,
        );
      }
      await tx.due.delete({ where: { id: due.id } });
    }
  }

  if (plannedByKey.size > 0) {
    await tx.due.createMany({
      data: [...plannedByKey.values()].map((d) => ({
        userId,
        expenseId,
        friendId: d.friendId,
        direction: d.direction,
        amount: d.amount,
        dueDate,
      })),
    });
  }
}

/** Make every page (dashboard, expenses, dues) show fresh data after a mutation. */
function revalidateAll() {
  revalidatePath("/", "layout");
  refresh();
}

function failure(error: unknown, fallback: string): ActionResult<never> {
  if (error instanceof FieldConflict) {
    return { ok: false, error: error.message, fieldErrors: { [error.field]: [error.message] } };
  }
  if (error instanceof SplitConflict) {
    return { ok: false, error: error.message, fieldErrors: { "split.participants": [error.message] } };
  }
  console.error(fallback, error);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return { ok: false, error: "This expense no longer exists. It may have been deleted." };
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return { ok: false, error: "Could not connect to the database. Please try again." };
  }
  return { ok: false, error: fallback };
}

function invalid(error: import("zod").ZodError): ActionResult<never> {
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: issuesToFieldErrors(error) };
}

/**
 * Adds an expense. With `recurringId`, it pays that recurring bill: the expense is
 * linked to it and the bill moves on to its next due date.
 */
export async function createExpense(
  input: ExpenseFormValues,
  options: { recurringId?: string } = {},
): Promise<ActionResult<ExpenseDTO>> {
  const parsed = expenseFormSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const recurringId = options.recurringId && objectIdSchema.safeParse(options.recurringId).success ? options.recurringId : null;

  const user = await requireUser();
  const plan = toPlan(parsed.data);

  try {
    const expense = await db.$transaction(async (tx) => {
      await assertOwnFriends(tx, user.id, parsed.data);
      const created = await tx.expense.create({ data: { ...plan.data, userId: user.id, recurringId } });
      await syncDues(tx, user.id, created.id, plan.dues, plan.dueDate);
      if (recurringId) {
        const rule = await tx.recurringExpense.findFirst({ where: { id: recurringId, userId: user.id } });
        if (!rule) throw new FieldConflict("_form", "This recurring bill no longer exists.");
        const next = nextOccurrence(rule.startDate, rule.frequency, rule.interval, rule.nextDate);
        const finished = rule.endDate !== null && next.getTime() > rule.endDate.getTime();
        await tx.recurringExpense.update({ where: { id: rule.id }, data: { nextDate: next, active: finished ? false : rule.active } });
      }
      return tx.expense.findUniqueOrThrow({ where: { id: created.id }, include: expenseInclude });
    });
    const warnings = await checkBudgetAlerts(user, [{ categoryId: plan.data.categoryId, date: plan.data.date }]);
    revalidateAll();
    return { ok: true, data: toExpenseDTO(expense), message: "Expense added", warnings };
  } catch (error) {
    return failure(error, "Failed to add expense.");
  }
}

export async function updateExpense(id: string, input: ExpenseFormValues): Promise<ActionResult<ExpenseDTO>> {
  const idResult = objectIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "Invalid expense id." };

  const parsed = expenseFormSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const user = await requireUser();
  const plan = toPlan(parsed.data);

  try {
    const expense = await db.$transaction(async (tx) => {
      await assertOwnFriends(tx, user.id, parsed.data);
      // userId in the filter: a user can only ever change their own expenses.
      await tx.expense.update({ where: { id: idResult.data, userId: user.id }, data: plan.data });
      await syncDues(tx, user.id, idResult.data, plan.dues, plan.dueDate);
      return tx.expense.findUniqueOrThrow({ where: { id: idResult.data }, include: expenseInclude });
    });
    const warnings = await checkBudgetAlerts(user, [{ categoryId: plan.data.categoryId, date: plan.data.date }]);
    revalidateAll();
    return { ok: true, data: toExpenseDTO(expense), message: "Expense updated", warnings };
  } catch (error) {
    return failure(error, "Failed to update expense.");
  }
}

export async function deleteExpense(id: string): Promise<ActionResult> {
  const idResult = objectIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "Invalid expense id." };

  const user = await requireUser();

  try {
    // Its dues and their repayments are removed too (cascade).
    await db.expense.delete({ where: { id: idResult.data, userId: user.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Expense deleted" };
  } catch (error) {
    return failure(error, "Failed to delete expense.");
  }
}
