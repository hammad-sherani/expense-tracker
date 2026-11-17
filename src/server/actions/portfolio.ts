"use server";

import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { dateInputToUTC, formatExpenseDate, toDateInput } from "@/lib/dates";
import { formatCurrency, roundMoney } from "@/lib/format";
import { ASSET_META, formatUnits, METAL_SYMBOL, replayTxns, type TxnLike, unitsLabel } from "@/lib/portfolio";
import { objectId } from "@/lib/validations/money";
import {
  type InvestmentCreateValues,
  investmentCreateSchema,
  type InvestmentEditValues,
  investmentEditSchema,
  type PriceValues,
  priceSchema,
  type TxnValues,
  txnSchema,
} from "@/lib/validations/portfolio";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult } from "@/types";

type Tx = Prisma.TransactionClient;

/** A problem the user can fix, shown on a field of the form. */
class TxnError extends Error {
  constructor(
    public field: string,
    message: string,
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
  if (e instanceof TxnError) return { ok: false, error: e.message, fieldErrors: { [e.field]: [e.message] } };
  console.error(fallback, e);
  return { ok: false, error: fallback };
}

/** Total typed by the user +/- fees becomes the money that actually moved. */
function txnData(v: TxnValues) {
  const gross = Number(v.amount);
  const fees = v.type === "DIVIDEND" ? 0 : roundMoney(Number(v.fees || 0));
  const units = v.type === "DIVIDEND" ? 0 : Number(v.units);
  return {
    type: v.type,
    date: dateInputToUTC(v.date),
    units,
    price: units > 0 ? gross / units : 0,
    fees,
    amount: roundMoney(v.type === "BUY" ? gross + fees : gross - fees),
    walletId: v.walletId || null,
    note: v.note || null,
  };
}

async function assertWallet(tx: Tx, userId: string, walletId: string | null) {
  if (!walletId) return;
  const w = await tx.wallet.findFirst({ where: { id: walletId, userId }, select: { id: true } });
  if (!w) throw new TxnError("walletId", "This wallet no longer exists.");
}

const toLike = (t: {
  id: string;
  type: TxnLike["type"];
  date: Date;
  createdAt: Date;
  units: number;
  amount: number;
}): TxnLike => ({
  id: t.id,
  type: t.type,
  date: toDateInput(t.date),
  createdAt: t.createdAt.toISOString(),
  units: t.units,
  amount: t.amount,
});

/** Rejects any change that would leave a sale selling more than was held at that time. */
function assertHistoryValid(txns: TxnLike[], unit: string, field: string) {
  const { oversold } = replayTxns(txns);
  if (!oversold) return;
  throw new TxnError(
    field,
    `On ${formatExpenseDate(oversold.date)} you'd be selling ${unitsLabel(oversold.tried, unit)} but would only hold ${unitsLabel(oversold.held, unit)}.`,
  );
}

async function ownInvestment(tx: Tx, userId: string, id: string) {
  const inv = await tx.investment.findFirst({
    where: { id, userId },
    include: { txns: { select: { id: true, type: true, date: true, createdAt: true, units: true, amount: true } } },
  });
  if (!inv) throw new TxnError("_form", "This investment no longer exists.");
  return inv;
}

export async function createInvestment(
  input: InvestmentCreateValues,
  first?: TxnValues,
): Promise<ActionResult<{ id: string }>> {
  const parsed = investmentCreateSchema.safeParse(input);
  const firstParsed = first ? txnSchema.safeParse(first) : null;
  if (!parsed.success || (firstParsed && !firstParsed.success)) {
    // Show every problem in the form at once, not one section at a time.
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: {
        ...(parsed.success ? {} : parsed.error.flatten().fieldErrors),
        ...(firstParsed && !firstParsed.success ? firstParsed.error.flatten().fieldErrors : {}),
      },
    };
  }
  const v = parsed.data;
  if (!ASSET_META[v.type].units.includes(v.unit)) {
    return { ok: false, error: "Choose a valid unit.", fieldErrors: { unit: ["Choose a valid unit"] } };
  }
  const user = await requireUser();
  const hasMarketPrice = METAL_SYMBOL[v.type] !== undefined;

  try {
    const created = await db.$transaction(async (tx) => {
      const inv = await tx.investment.create({
        data: {
          userId: user.id,
          name: v.name,
          type: v.type,
          unit: v.unit,
          autoPrice: hasMarketPrice && v.autoPrice,
          premiumPct: hasMarketPrice ? Number(v.premiumPct) : 0,
          notes: v.notes || null,
        },
      });
      if (firstParsed?.success) {
        const data = txnData(firstParsed.data);
        await assertWallet(tx, user.id, data.walletId);
        await tx.investmentTxn.create({ data: { ...data, userId: user.id, investmentId: inv.id } });
      }
      return inv;
    });
    revalidateAll();
    return { ok: true, data: { id: created.id }, message: `${created.name} added to your portfolio` };
  } catch (e) {
    return failure(e, "Couldn't add this investment.");
  }
}

export async function updateInvestment(id: string, input: InvestmentEditValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid investment." };
  const parsed = investmentEditSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const v = parsed.data;
  try {
    const inv = await db.investment.findFirst({ where: { id, userId: user.id } });
    if (!inv) return { ok: false, error: "This investment no longer exists." };
    const hasMarketPrice = METAL_SYMBOL[inv.type] !== undefined;
    await db.investment.update({
      where: { id: inv.id },
      data: {
        name: v.name,
        autoPrice: hasMarketPrice && v.autoPrice,
        premiumPct: hasMarketPrice ? Number(v.premiumPct) : 0,
        notes: v.notes || null,
      },
    });
    revalidateAll();
    return { ok: true, data: undefined, message: "Investment updated" };
  } catch (e) {
    return failure(e, "Couldn't update this investment.");
  }
}

/** Only fully sold investments can be archived, so the portfolio totals stay true. */
export async function setInvestmentArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid investment." };
  const user = await requireUser();
  try {
    const inv = await ownInvestment(db, user.id, id);
    if (archived && replayTxns(inv.txns.map(toLike)).units > 0) {
      return { ok: false, error: "Sell everything first. Only finished investments can be archived." };
    }
    await db.investment.update({ where: { id: inv.id }, data: { archivedAt: archived ? new Date() : null } });
    revalidateAll();
    return { ok: true, data: undefined, message: archived ? "Moved to closed investments" : "Restored" };
  } catch (e) {
    return failure(e, "Couldn't update this investment.");
  }
}

/** Removes the investment and its history. Wallets go back to as if it never happened. */
export async function deleteInvestment(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid investment." };
  const user = await requireUser();
  try {
    await db.investment.delete({ where: { id, userId: user.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Investment deleted" };
  } catch (e) {
    return failure(e, "Couldn't delete this investment.");
  }
}

function txnMessage(type: TxnValues["type"], units: number, unit: string, amount: number, name: string) {
  if (type === "DIVIDEND") return `Dividend of ${formatCurrency(amount)} recorded`;
  return `${type === "BUY" ? "Bought" : "Sold"} ${unitsLabel(units, unit)} of ${name}`;
}

export async function addTxn(investmentId: string, input: TxnValues): Promise<ActionResult> {
  if (!objectId.safeParse(investmentId).success) return { ok: false, error: "Invalid investment." };
  const parsed = txnSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const data = txnData(parsed.data);
  try {
    const message = await db.$transaction(async (tx) => {
      const inv = await ownInvestment(tx, user.id, investmentId);
      await assertWallet(tx, user.id, data.walletId);
      const next: TxnLike = { id: "new", ...data, date: toDateInput(data.date), createdAt: new Date().toISOString() };
      assertHistoryValid([...inv.txns.map(toLike), next], inv.unit, "units");
      await tx.investmentTxn.create({ data: { ...data, userId: user.id, investmentId: inv.id } });
      return txnMessage(data.type, data.units, inv.unit, data.amount, inv.name);
    });
    revalidateAll();
    return { ok: true, data: undefined, message };
  } catch (e) {
    return failure(e, "Couldn't save this transaction.");
  }
}

export async function updateTxn(id: string, input: TxnValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid transaction." };
  const parsed = txnSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const data = txnData(parsed.data);
  try {
    await db.$transaction(async (tx) => {
      const current = await tx.investmentTxn.findFirst({ where: { id, userId: user.id } });
      if (!current) throw new TxnError("_form", "This transaction no longer exists.");
      const inv = await ownInvestment(tx, user.id, current.investmentId);
      await assertWallet(tx, user.id, data.walletId);
      const others = inv.txns.filter((t) => t.id !== id).map(toLike);
      const next: TxnLike = { id, ...data, date: toDateInput(data.date), createdAt: current.createdAt.toISOString() };
      assertHistoryValid([...others, next], inv.unit, "units");
      await tx.investmentTxn.update({ where: { id }, data });
    });
    revalidateAll();
    return { ok: true, data: undefined, message: "Transaction updated" };
  } catch (e) {
    return failure(e, "Couldn't update this transaction.");
  }
}

export async function deleteTxn(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid transaction." };
  const user = await requireUser();
  try {
    await db.$transaction(async (tx) => {
      const current = await tx.investmentTxn.findFirst({ where: { id, userId: user.id } });
      if (!current) throw new TxnError("_form", "This transaction no longer exists.");
      const inv = await ownInvestment(tx, user.id, current.investmentId);
      assertHistoryValid(inv.txns.filter((t) => t.id !== id).map(toLike), inv.unit, "_form");
      await tx.investmentTxn.delete({ where: { id } });
    });
    revalidateAll();
    return { ok: true, data: undefined, message: "Transaction deleted" };
  } catch (e) {
    return failure(e, "Couldn't delete this transaction.");
  }
}

/** Saves the price for a day (one per day; saving again replaces it). */
export async function setPrice(investmentId: string, input: PriceValues): Promise<ActionResult> {
  if (!objectId.safeParse(investmentId).success) return { ok: false, error: "Invalid investment." };
  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  const date = dateInputToUTC(parsed.data.date);
  const price = Number(parsed.data.price);
  try {
    const inv = await db.investment.findFirst({ where: { id: investmentId, userId: user.id } });
    if (!inv) return { ok: false, error: "This investment no longer exists." };
    await db.investmentPrice.upsert({
      where: { investmentId_date_source: { investmentId: inv.id, date, source: "MANUAL" } },
      create: { userId: user.id, investmentId: inv.id, date, price, source: "MANUAL" },
      update: { price },
    });
    revalidateAll();
    return { ok: true, data: undefined, message: `Price saved: Rs. ${formatUnits(price)}` };
  } catch (e) {
    return failure(e, "Couldn't save the price.");
  }
}

export async function deletePrice(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid price." };
  const user = await requireUser();
  try {
    const res = await db.investmentPrice.deleteMany({ where: { id, userId: user.id, source: "MANUAL" } });
    if (res.count === 0) return { ok: false, error: "This price no longer exists." };
    revalidateAll();
    return { ok: true, data: undefined, message: "Price removed" };
  } catch (e) {
    return failure(e, "Couldn't remove the price.");
  }
}
