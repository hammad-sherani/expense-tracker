"use server";

import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { dateInputToUTC, todayUTC } from "@/lib/dates";
import { formatCurrency, roundMoney } from "@/lib/format";
import { toPaisa } from "@/lib/split";
import {
  type ExpectedValues,
  expectedSchema,
  type GoalCreateValues,
  goalCreateSchema,
  type GoalMoneyValues,
  goalMoneySchema,
  type GoalValues,
  goalSchema,
  type ReceivedValues,
  receivedSchema,
} from "@/lib/validations/goals";
import { objectId } from "@/lib/validations/money";
import { goalBalance } from "@/server/goal-fund";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult } from "@/types";

type Tx = Prisma.TransactionClient;

/** A problem the user can fix; `field` ties it to a form input. */
class GoalError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

const invalid = (e: import("zod").ZodError): ActionResult<never> => ({
  ok: false,
  error: "Please fix the highlighted fields.",
  fieldErrors: e.flatten().fieldErrors as Record<string, string[] | undefined>,
});

function failure(e: unknown, fallback: string): ActionResult<never> {
  if (e instanceof GoalError) {
    return { ok: false, error: e.message, ...(e.field ? { fieldErrors: { [e.field]: [e.message] } } : {}) };
  }
  console.error(fallback, e);
  return { ok: false, error: fallback };
}

const badId: ActionResult<never> = { ok: false, error: "Invalid request." };

async function ownWallet(tx: Tx, userId: string, walletId: string, field = "walletId") {
  if (!walletId) return null;
  const w = await tx.wallet.findFirst({ where: { id: walletId, userId }, select: { id: true } });
  if (!w) throw new GoalError("This wallet no longer exists.", field);
  return w.id;
}

async function ownGoal(tx: Tx, userId: string, goalId: string, field?: string) {
  const g = await tx.goal.findFirst({ where: { id: goalId, userId } });
  if (!g) throw new GoalError("This goal no longer exists.", field);
  return g;
}

function goalData(v: GoalValues) {
  return {
    name: v.name,
    targetAmount: roundMoney(Number(v.targetAmount)),
    targetDate: v.targetDate ? dateInputToUTC(v.targetDate) : null,
    notes: v.notes || null,
  };
}

export async function createGoal(input: GoalCreateValues): Promise<ActionResult<{ id: string }>> {
  const parsed = goalCreateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  try {
    const goal = await db.$transaction(async (tx) => {
      const walletId = await ownWallet(tx, user.id, v.alreadySavedWalletId, "alreadySavedWalletId");
      const g = await tx.goal.create({ data: { userId: user.id, ...goalData(v) } });
      const already = roundMoney(Number(v.alreadySaved || 0));
      if (already > 0) {
        await tx.goalEntry.create({
          data: {
            userId: user.id,
            goalId: g.id,
            type: "DEPOSIT",
            amount: already,
            date: todayUTC(),
            walletId,
            note: "Already saved",
          },
        });
      }
      return g;
    });
    revalidateAll();
    return { ok: true, data: { id: goal.id }, message: `${goal.name} goal created` };
  } catch (e) {
    return failure(e, "Couldn't create this goal.");
  }
}

export async function updateGoal(id: string, input: GoalValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  try {
    await ownGoal(db, user.id, id);
    await db.goal.update({ where: { id }, data: goalData(parsed.data) });
    revalidateAll();
    return { ok: true, data: undefined, message: "Goal updated" };
  } catch (e) {
    return failure(e, "Couldn't update this goal.");
  }
}

/** Only an empty fund can be archived, so no money disappears from view. */
export async function setGoalArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const user = await requireUser();
  try {
    await ownGoal(db, user.id, id);
    if (archived && toPaisa(await goalBalance(db, user.id, id)) !== 0) {
      throw new GoalError("Take out or spend what's in the fund before archiving.");
    }
    await db.goal.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    revalidateAll();
    return { ok: true, data: undefined, message: archived ? "Goal archived" : "Goal restored" };
  } catch (e) {
    return failure(e, "Couldn't update this goal.");
  }
}

/** Undoes the goal and its deposits. Refused once money was spent from it, to keep those expenses meaningful. */
export async function deleteGoal(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const user = await requireUser();
  try {
    await ownGoal(db, user.id, id);
    if ((await db.expense.count({ where: { userId: user.id, goalId: id } })) > 0) {
      throw new GoalError("Money has been spent from this fund, so it can't be deleted. Archive it instead.");
    }
    await db.goal.delete({ where: { id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Goal deleted" };
  } catch (e) {
    return failure(e, "Couldn't delete this goal.");
  }
}

export async function addMoney(goalId: string, input: GoalMoneyValues): Promise<ActionResult> {
  if (!objectId.safeParse(goalId).success) return badId;
  const parsed = goalMoneySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  try {
    const amount = roundMoney(Number(v.amount));
    const name = await db.$transaction(async (tx) => {
      const g = await ownGoal(tx, user.id, goalId);
      const walletId = await ownWallet(tx, user.id, v.walletId);
      await tx.goalEntry.create({
        data: { userId: user.id, goalId, type: "DEPOSIT", amount, date: dateInputToUTC(v.date), walletId, note: v.note || null },
      });
      return g.name;
    });
    revalidateAll();
    return { ok: true, data: undefined, message: `${formatCurrency(amount)} added to ${name}` };
  } catch (e) {
    return failure(e, "Couldn't add this money.");
  }
}

export async function withdrawMoney(goalId: string, input: GoalMoneyValues): Promise<ActionResult> {
  if (!objectId.safeParse(goalId).success) return badId;
  const parsed = goalMoneySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  try {
    const amount = roundMoney(Number(v.amount));
    const name = await db.$transaction(async (tx) => {
      const g = await ownGoal(tx, user.id, goalId);
      const walletId = await ownWallet(tx, user.id, v.walletId);
      const balance = await goalBalance(tx, user.id, goalId);
      if (toPaisa(amount) > toPaisa(balance)) throw new GoalError(`Only ${formatCurrency(balance)} is in this fund.`, "amount");
      await tx.goalEntry.create({
        data: { userId: user.id, goalId, type: "WITHDRAW", amount, date: dateInputToUTC(v.date), walletId, note: v.note || null },
      });
      return g.name;
    });
    revalidateAll();
    return { ok: true, data: undefined, message: `${formatCurrency(amount)} taken out of ${name}` };
  } catch (e) {
    return failure(e, "Couldn't take this money out.");
  }
}

export async function deleteEntry(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const user = await requireUser();
  try {
    await db.$transaction(async (tx) => {
      const entry = await tx.goalEntry.findFirst({ where: { id, userId: user.id } });
      if (!entry) throw new GoalError("This entry no longer exists.");
      if (entry.expectedPaymentId) throw new GoalError("This came from a project payment. Undo it under Project payments.");
      if (entry.type === "DEPOSIT") {
        const balance = await goalBalance(tx, user.id, entry.goalId);
        if (toPaisa(entry.amount) > toPaisa(balance)) {
          throw new GoalError("This money has already been spent or taken out, so it can't be removed.");
        }
      }
      await tx.goalEntry.delete({ where: { id } });
    });
    revalidateAll();
    return { ok: true, data: undefined, message: "Entry removed" };
  } catch (e) {
    return failure(e, "Couldn't remove this entry.");
  }
}

function expectedData(v: ExpectedValues) {
  return {
    source: v.source,
    amount: roundMoney(Number(v.amount)),
    expectedDate: dateInputToUTC(v.expectedDate),
    goalId: v.goalId || null,
    goalAmount: v.goalId && v.goalAmount !== "" ? roundMoney(Number(v.goalAmount)) : null,
    notes: v.notes || null,
  };
}

export async function createExpected(input: ExpectedValues): Promise<ActionResult> {
  const parsed = expectedSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  try {
    if (parsed.data.goalId) await ownGoal(db, user.id, parsed.data.goalId, "goalId");
    await db.expectedPayment.create({ data: { userId: user.id, ...expectedData(parsed.data) } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Expected payment added" };
  } catch (e) {
    return failure(e, "Couldn't add this payment.");
  }
}

async function ownPending(tx: Tx, userId: string, id: string) {
  const p = await tx.expectedPayment.findFirst({ where: { id, userId } });
  if (!p) throw new GoalError("This payment no longer exists.");
  if (p.receivedAt) throw new GoalError("This payment was already received.");
  return p;
}

export async function updateExpected(id: string, input: ExpectedValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const parsed = expectedSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  try {
    await ownPending(db, user.id, id);
    if (parsed.data.goalId) await ownGoal(db, user.id, parsed.data.goalId, "goalId");
    await db.expectedPayment.update({ where: { id }, data: expectedData(parsed.data) });
    revalidateAll();
    return { ok: true, data: undefined, message: "Payment updated" };
  } catch (e) {
    return failure(e, "Couldn't update this payment.");
  }
}

export async function deleteExpected(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const user = await requireUser();
  try {
    await ownPending(db, user.id, id);
    await db.expectedPayment.delete({ where: { id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Payment removed" };
  } catch (e) {
    return failure(e, "Couldn't remove this payment.");
  }
}

/** The payment arrives: all of it is income, and the chosen share goes straight into the fund. */
export async function markReceived(id: string, input: ReceivedValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const parsed = receivedSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  const received = roundMoney(Number(v.amount));
  const share = roundMoney(Number(v.goalAmount || 0));
  const date = dateInputToUTC(v.date);
  try {
    const message = await db.$transaction(async (tx) => {
      const p = await ownPending(tx, user.id, id);
      const walletId = await ownWallet(tx, user.id, v.walletId);
      const goal = share > 0 ? await ownGoal(tx, user.id, v.goalId, "goalId") : null;
      const income = await tx.income.create({
        data: { userId: user.id, amount: received, source: p.source, type: "FREELANCE", walletId, date },
      });
      await tx.expectedPayment.update({
        where: { id: p.id },
        data: { receivedAt: date, receivedAmount: received, incomeId: income.id, goalId: goal?.id ?? p.goalId },
      });
      if (goal) {
        await tx.goalEntry.create({
          data: { userId: user.id, goalId: goal.id, type: "DEPOSIT", amount: share, date, walletId, expectedPaymentId: p.id },
        });
      }
      const rest = roundMoney(p.amount - received);
      if (v.expectRest && rest > 0) {
        const plannedShare = p.goalAmount === null ? null : roundMoney(Math.max(0, p.goalAmount - share));
        await tx.expectedPayment.create({
          data: {
            userId: user.id,
            source: p.source,
            amount: rest,
            expectedDate: p.expectedDate,
            goalId: p.goalId,
            goalAmount: plannedShare === null ? null : Math.min(plannedShare, rest),
            restOfId: p.id,
          },
        });
      }
      return goal
        ? `${formatCurrency(received)} received, ${formatCurrency(share)} added to ${goal.name}`
        : `${formatCurrency(received)} received`;
    });
    revalidateAll();
    return { ok: true, data: undefined, message };
  } catch (e) {
    return failure(e, "Couldn't record this payment.");
  }
}

/** Puts a received payment back to expected, removing its income and fund deposit. */
export async function undoReceived(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const user = await requireUser();
  try {
    await db.$transaction(async (tx) => {
      const p = await tx.expectedPayment.findFirst({ where: { id, userId: user.id } });
      if (!p || !p.receivedAt) throw new GoalError("This payment isn't marked as received.");

      const rest = await tx.expectedPayment.findFirst({ where: { userId: user.id, restOfId: p.id } });
      if (rest?.receivedAt) throw new GoalError("The rest of this payment was already received. Undo that first.");

      const entries = await tx.goalEntry.findMany({ where: { userId: user.id, expectedPaymentId: p.id } });
      for (const entry of entries) {
        const balance = await goalBalance(tx, user.id, entry.goalId);
        if (toPaisa(entry.amount) > toPaisa(balance)) {
          throw new GoalError("This money has already been spent from the fund, so it can't be undone.");
        }
      }
      await tx.goalEntry.deleteMany({ where: { userId: user.id, expectedPaymentId: p.id } });
      if (p.incomeId) await tx.income.deleteMany({ where: { id: p.incomeId, userId: user.id } });
      if (rest) await tx.expectedPayment.delete({ where: { id: rest.id } });
      await tx.expectedPayment.update({
        where: { id: p.id },
        data: { receivedAt: null, receivedAmount: null, incomeId: null },
      });
    });
    revalidateAll();
    return { ok: true, data: undefined, message: "Marked as not received" };
  } catch (e) {
    return failure(e, "Couldn't undo this payment.");
  }
}
