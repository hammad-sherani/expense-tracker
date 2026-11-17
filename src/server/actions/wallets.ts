"use server";

import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { dateInputToUTC } from "@/lib/dates";
import { formatCurrency, roundMoney } from "@/lib/format";
import {
  type AdjustmentValues,
  adjustmentSchema,
  objectId,
  type TransferValues,
  transferSchema,
  type WalletValues,
  walletSchema,
} from "@/lib/validations/money";
import type { z } from "zod";
import { walletBalances } from "@/server/queries/lookups";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult } from "@/types";

const dup = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const nameTaken = { ok: false as const, error: "You already have a wallet with this name.", fieldErrors: { name: ["Name already used"] } };
const invalid = (e: import("zod").ZodError) => ({
  ok: false as const,
  error: "Please fix the highlighted fields.",
  fieldErrors: e.flatten().fieldErrors as Record<string, string[] | undefined>,
});

function walletData(v: z.output<typeof walletSchema>) {
  const card = v.type === "CARD";
  return {
    name: v.name,
    nameKey: v.name.toLowerCase(),
    type: v.type,
    color: v.color,
    openingBalance: roundMoney(Number(v.openingBalance)),
    creditLimit: card && v.creditLimit ? roundMoney(Number(v.creditLimit)) : null,
    dueDay: card && typeof v.dueDay === "number" ? v.dueDay : null,
  };
}

export async function createWallet(input: WalletValues): Promise<ActionResult<{ id: string }>> {
  const parsed = walletSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  try {
    const last = await db.wallet.findFirst({ where: { userId: user.id }, orderBy: { sortOrder: "desc" } });
    const w = await db.wallet.create({
      data: { userId: user.id, ...walletData(parsed.data), sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    revalidateAll();
    return { ok: true, data: { id: w.id }, message: `Wallet "${w.name}" added` };
  } catch (e) {
    if (dup(e)) return nameTaken;
    console.error("create wallet failed", e);
    return { ok: false, error: "Couldn't add the wallet." };
  }
}

export async function updateWallet(id: string, input: WalletValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid wallet." };
  const parsed = walletSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  try {
    await db.wallet.update({ where: { id, userId: user.id }, data: walletData(parsed.data) });
    revalidateAll();
    return { ok: true, data: undefined, message: "Wallet updated" };
  } catch (e) {
    if (dup(e)) return nameTaken;
    console.error("update wallet failed", e);
    return { ok: false, error: "Couldn't update the wallet." };
  }
}

export async function setWalletArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid wallet." };
  const user = await requireUser();
  try {
    const w = await db.wallet.update({
      where: { id, userId: user.id },
      data: { archivedAt: archived ? new Date() : null },
    });
    revalidateAll();
    return { ok: true, data: undefined, message: archived ? `"${w.name}" archived` : `"${w.name}" restored` };
  } catch (e) {
    console.error("archive wallet failed", e);
    return { ok: false, error: "Couldn't update the wallet." };
  }
}

/** Only wallets with no recorded activity can be deleted; others can be archived. */
export async function deleteWallet(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid wallet." };
  const user = await requireUser();
  try {
    const where = { userId: user.id, walletId: id };
    const [expenses, incomes, payments, dues, transfers, investing, committeePaid, pots, goalMoney, loansIn, loanPaid, collected, adjusted] = await Promise.all([
      db.expense.count({ where }),
      db.income.count({ where }),
      db.duePayment.count({ where }),
      db.due.count({ where }),
      db.transfer.count({ where: { userId: user.id, OR: [{ fromWalletId: id }, { toWalletId: id }] } }),
      db.investmentTxn.count({ where }),
      db.committeePayment.count({ where }),
      db.committee.count({ where: { userId: user.id, payoutWalletId: id } }),
      db.goalEntry.count({ where }),
      db.loan.count({ where: { userId: user.id, receivedWalletId: id } }),
      db.loanPayment.count({ where }),
      db.committeeCollection.count({ where }),
      db.walletAdjustment.count({ where }),
    ]);
    if (expenses + incomes + payments + dues + transfers + investing + committeePaid + pots + goalMoney + loansIn + loanPaid + collected + adjusted > 0) {
      return { ok: false, error: "This wallet has transactions, so it can't be deleted. Archive it instead." };
    }
    await db.wallet.delete({ where: { id, userId: user.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Wallet deleted" };
  } catch (e) {
    console.error("delete wallet failed", e);
    return { ok: false, error: "Couldn't delete the wallet." };
  }
}

export async function createTransfer(input: TransferValues): Promise<ActionResult> {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  try {
    const owned = await db.wallet.findMany({
      where: { userId: user.id, id: { in: [v.fromWalletId, v.toWalletId] } },
      select: { id: true, name: true },
    });
    if (owned.length !== 2) return { ok: false, error: "Choose two of your wallets." };
    await db.transfer.create({
      data: {
        userId: user.id,
        fromWalletId: v.fromWalletId,
        toWalletId: v.toWalletId,
        amount: roundMoney(Number(v.amount)),
        date: dateInputToUTC(v.date),
        note: v.note || null,
      },
    });
    const name = (wid: string) => owned.find((w) => w.id === wid)?.name;
    revalidateAll();
    return {
      ok: true,
      data: undefined,
      message: `Moved ${formatCurrency(Number(v.amount))} from ${name(v.fromWalletId)} to ${name(v.toWalletId)}`,
    };
  } catch (e) {
    console.error("create transfer failed", e);
    return { ok: false, error: "Couldn't save the transfer." };
  }
}

/** Corrects a wallet's balance without counting it as income or spending. */
export async function createAdjustment(input: AdjustmentValues): Promise<ActionResult> {
  const parsed = adjustmentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  try {
    const wallet = await db.wallet.findFirst({ where: { id: v.walletId, userId: user.id }, select: { id: true, name: true } });
    if (!wallet) return { ok: false, error: "Wallet not found." };
    let amount = roundMoney(Number(v.amount));
    if (v.mode === "DEBIT") amount = -amount;
    if (v.mode === "SET") {
      const current = roundMoney((await walletBalances(user.id)).get(wallet.id) ?? 0);
      amount = roundMoney(amount - current);
      if (amount === 0) {
        return { ok: false, error: `${wallet.name} already shows ${formatCurrency(current)}.`, fieldErrors: { amount: ["That's the balance already"] } };
      }
    }
    await db.walletAdjustment.create({
      data: { userId: user.id, walletId: wallet.id, amount, date: dateInputToUTC(v.date), note: v.note || null },
    });
    revalidateAll();
    return {
      ok: true,
      data: undefined,
      message: `${amount > 0 ? "Added" : "Took out"} ${formatCurrency(Math.abs(amount))} ${amount > 0 ? "to" : "from"} ${wallet.name}`,
    };
  } catch (e) {
    console.error("create adjustment failed", e);
    return { ok: false, error: "Couldn't adjust the balance." };
  }
}

export async function deleteAdjustment(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid adjustment." };
  const user = await requireUser();
  try {
    await db.walletAdjustment.delete({ where: { id, userId: user.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Adjustment removed" };
  } catch (e) {
    console.error("delete adjustment failed", e);
    return { ok: false, error: "Couldn't remove the adjustment." };
  }
}

export async function deleteTransfer(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid transfer." };
  const user = await requireUser();
  try {
    await db.transfer.delete({ where: { id, userId: user.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Transfer removed" };
  } catch (e) {
    console.error("delete transfer failed", e);
    return { ok: false, error: "Couldn't remove the transfer." };
  }
}
