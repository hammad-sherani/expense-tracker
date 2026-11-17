"use server";

import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { collectionState, installmentDate } from "@/lib/committee";
import { db } from "@/lib/db";
import { dateInputToUTC, todayUTC } from "@/lib/dates";
import { formatCurrency, roundMoney } from "@/lib/format";
import {
  type CommitteeCreateValues,
  committeeCreateSchema,
  type CommitteeEditValues,
  committeeEditSchema,
  type CommitteePayoutValues,
  committeePayoutSchema,
  type CommitteePayValues,
  committeePaySchema,
} from "@/lib/validations/committee";
import { objectId } from "@/lib/validations/money";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult } from "@/types";

/** A problem the user can fix; `field` ties it to a form input. */
class CommitteeError extends Error {
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
  if (e instanceof CommitteeError) {
    return { ok: false, error: e.message, ...(e.field ? { fieldErrors: { [e.field]: [e.message] } } : {}) };
  }
  console.error(fallback, e);
  return { ok: false, error: fallback };
}

const badId: ActionResult<never> = { ok: false, error: "Invalid committee." };

async function assertWallet(userId: string, walletId: string) {
  if (!walletId) return null;
  const w = await db.wallet.findFirst({ where: { id: walletId, userId }, select: { id: true } });
  if (!w) throw new CommitteeError("This wallet no longer exists.", "walletId");
  return w.id;
}

async function ownCommittee(userId: string, id: string) {
  const c = await db.committee.findFirst({
    where: { id, userId },
    include: {
      payments: { select: { id: true, installment: true, amount: true }, orderBy: { installment: "asc" } },
      collections: { select: { id: true, installment: true, amount: true }, orderBy: { installment: "asc" } },
    },
  });
  if (!c) throw new CommitteeError("This committee no longer exists.");
  return c;
}

async function assertFriend(userId: string, friendId: string | undefined) {
  if (!friendId) return null;
  const f = await db.friend.findFirst({ where: { id: friendId, userId }, select: { id: true } });
  if (!f) throw new CommitteeError("This person no longer exists.", "forFriendId");
  return f.id;
}

export async function createCommittee(input: CommitteeCreateValues): Promise<ActionResult<{ id: string }>> {
  const parsed = committeeCreateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  const startDate = dateInputToUTC(v.startDate);
  const monthlyAmount = roundMoney(Number(v.monthlyAmount));
  const today = todayUTC();
  try {
    const forFriendId = await assertFriend(user.id, v.forFriendId);
    const created = await db.$transaction(async (tx) => {
      const c = await tx.committee.create({
        data: {
          userId: user.id,
          name: v.name,
          monthlyAmount,
          members: v.members,
          turn: v.turn,
          startDate,
          notes: v.notes || null,
          forFriendId,
        },
      });
      if (v.paidBefore > 0) {
        // Past installments have no wallet, so today's balances aren't touched.
        const past = Array.from({ length: v.paidBefore }, (_, i) => {
          const due = installmentDate(startDate, i + 1);
          return { userId: user.id, committeeId: c.id, installment: i + 1, date: due > today ? today : due, amount: monthlyAmount };
        });
        await tx.committeePayment.createMany({ data: past });
        // A friend's share: the past installments are taken as already paid back.
        if (forFriendId) await tx.committeeCollection.createMany({ data: past });
      }
      return c;
    });
    revalidateAll();
    return { ok: true, data: { id: created.id }, message: `${created.name} added` };
  } catch (e) {
    return failure(e, "Couldn't add this committee.");
  }
}

export async function updateCommittee(id: string, input: CommitteeEditValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const parsed = committeeEditSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  const startDate = dateInputToUTC(v.startDate);
  try {
    const c = await ownCommittee(user.id, id);
    if (c.payments.length > 0 && startDate.getTime() !== c.startDate.getTime()) {
      throw new CommitteeError("The first date can't change once installments are recorded.", "startDate");
    }
    if (v.members < c.payments.length) {
      throw new CommitteeError(`You've already paid ${c.payments.length} installments.`, "members");
    }
    if (v.members < c.collections.length) {
      throw new CommitteeError(`You've already collected ${c.collections.length} installments.`, "members");
    }
    const forFriendId = await assertFriend(user.id, v.forFriendId);
    const started = c.payments.length > 0 || c.collections.length > 0 || c.payoutAt !== null;
    if (started && Boolean(forFriendId) !== Boolean(c.forFriendId)) {
      throw new CommitteeError("Whose share this is can't change once payments are recorded.", "forFriendId");
    }
    await db.committee.update({
      where: { id: c.id },
      data: {
        name: v.name,
        monthlyAmount: roundMoney(Number(v.monthlyAmount)),
        members: v.members,
        turn: v.turn,
        startDate,
        notes: v.notes || null,
        forFriendId,
      },
    });
    revalidateAll();
    return { ok: true, data: undefined, message: "Committee updated" };
  } catch (e) {
    return failure(e, "Couldn't update this committee.");
  }
}

/** Records the next unpaid installment. */
export async function payInstallment(id: string, input: CommitteePayValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const parsed = committeePaySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  try {
    const c = await ownCommittee(user.id, id);
    const walletId = await assertWallet(user.id, v.walletId);
    if (c.payments.length >= c.members) throw new CommitteeError("All installments are already paid.");
    const installment = c.payments.length + 1;
    await db.committeePayment.create({
      data: {
        userId: user.id,
        committeeId: c.id,
        installment,
        date: dateInputToUTC(v.date),
        amount: roundMoney(Number(v.amount)),
        walletId,
        note: v.note || null,
      },
    });
    revalidateAll();
    return { ok: true, data: undefined, message: `Installment ${installment} of ${c.members} paid` };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "This installment was already recorded." };
    }
    return failure(e, "Couldn't record this installment.");
  }
}

export async function undoLastPayment(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const user = await requireUser();
  try {
    const c = await ownCommittee(user.id, id);
    const last = c.payments.at(-1);
    if (!last) throw new CommitteeError("There's nothing to undo.");
    await db.committeePayment.delete({ where: { id: last.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: `Installment ${last.installment} removed` };
  } catch (e) {
    return failure(e, "Couldn't undo this installment.");
  }
}

export async function receivePayout(id: string, input: CommitteePayoutValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const parsed = committeePayoutSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  try {
    const c = await ownCommittee(user.id, id);
    // A friend's pot passes straight through to them, so no wallet changes.
    const walletId = c.forFriendId ? null : await assertWallet(user.id, v.walletId);
    if (c.payoutAt) throw new CommitteeError("The pot is already marked as received.");
    const amount = roundMoney(Number(v.amount));
    await db.committee.update({
      where: { id: c.id },
      data: { payoutAt: dateInputToUTC(v.date), payoutAmount: amount, payoutWalletId: walletId },
    });
    revalidateAll();
    return { ok: true, data: undefined, message: `Pot of ${formatCurrency(amount)} received` };
  } catch (e) {
    return failure(e, "Couldn't record the pot.");
  }
}

export async function undoPayout(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const user = await requireUser();
  try {
    const c = await ownCommittee(user.id, id);
    await db.committee.update({
      where: { id: c.id },
      data: { payoutAt: null, payoutAmount: null, payoutWalletId: null },
    });
    revalidateAll();
    return { ok: true, data: undefined, message: "Pot marked as not received" };
  } catch (e) {
    return failure(e, "Couldn't undo this.");
  }
}

/** Only finished committees can be archived, so nothing still due disappears. */
export async function setCommitteeArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const user = await requireUser();
  try {
    const c = await ownCommittee(user.id, id);
    if (archived && (c.payments.length < c.members || !c.payoutAt)) {
      throw new CommitteeError("Finish all installments and receive the pot before archiving.");
    }
    if (archived && c.forFriendId && collectionState(c).friendOwes !== 0) {
      throw new CommitteeError("Settle up with your friend before archiving.");
    }
    await db.committee.update({ where: { id: c.id }, data: { archivedAt: archived ? new Date() : null } });
    revalidateAll();
    return { ok: true, data: undefined, message: archived ? "Committee archived" : "Committee restored" };
  } catch (e) {
    return failure(e, "Couldn't update this committee.");
  }
}

/** Removes the committee and its history. Wallets go back to as if it never happened. */
export async function deleteCommittee(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const user = await requireUser();
  try {
    await db.committee.delete({ where: { id, userId: user.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Committee deleted" };
  } catch (e) {
    return failure(e, "Couldn't delete this committee.");
  }
}

/** Records money a friend gave back for the next installment of their share. */
export async function collectFromFriend(id: string, input: CommitteePayValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const parsed = committeePaySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  try {
    const c = await ownCommittee(user.id, id);
    if (!c.forFriendId) throw new CommitteeError("This is your own share.");
    const walletId = await assertWallet(user.id, v.walletId);
    if (c.collections.length >= c.members) throw new CommitteeError("Every installment is already collected.");
    const installment = c.collections.length + 1;
    await db.committeeCollection.create({
      data: {
        userId: user.id,
        committeeId: c.id,
        installment,
        date: dateInputToUTC(v.date),
        amount: roundMoney(Number(v.amount)),
        walletId,
      },
    });
    revalidateAll();
    return { ok: true, data: undefined, message: `Collected installment ${installment} of ${c.members}` };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "This installment was already collected." };
    }
    return failure(e, "Couldn't record this.");
  }
}

export async function undoLastCollection(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return badId;
  const user = await requireUser();
  try {
    const c = await ownCommittee(user.id, id);
    const last = c.collections.at(-1);
    if (!last) throw new CommitteeError("There's nothing to undo.");
    await db.committeeCollection.delete({ where: { id: last.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: `Collection ${last.installment} removed` };
  } catch (e) {
    return failure(e, "Couldn't undo this.");
  }
}
