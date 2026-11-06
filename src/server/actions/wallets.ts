"use server";

import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { dateInputToUTC } from "@/lib/dates";
import { formatCurrency, roundMoney } from "@/lib/format";
import { objectId, type TransferValues, transferSchema, type WalletValues, walletSchema } from "@/lib/validations/money";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult } from "@/types";

const dup = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const nameTaken = { ok: false as const, error: "You already have a wallet with this name.", fieldErrors: { name: ["Name already used"] } };
const invalid = (e: import("zod").ZodError) => ({
  ok: false as const,
  error: "Please fix the highlighted fields.",
  fieldErrors: e.flatten().fieldErrors as Record<string, string[] | undefined>,
});

function walletData(v: WalletValues) {
  return {
    name: v.name,
    nameKey: v.name.toLowerCase(),
    type: v.type,
    color: v.color,
    openingBalance: roundMoney(Number(v.openingBalance)),
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
    const [expenses, incomes, payments, dues, transfers] = await Promise.all([
      db.expense.count({ where }),
      db.income.count({ where }),
      db.duePayment.count({ where }),
      db.due.count({ where }),
      db.transfer.count({ where: { userId: user.id, OR: [{ fromWalletId: id }, { toWalletId: id }] } }),
    ]);
    if (expenses + incomes + payments + dues + transfers > 0) {
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
