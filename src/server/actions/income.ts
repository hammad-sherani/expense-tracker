"use server";

import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { dateInputToUTC } from "@/lib/dates";
import { roundMoney } from "@/lib/format";
import { WITHHOLDING_TYPES } from "@/lib/tax-rates";
import { type IncomeFormValues, incomeFormSchema, objectId } from "@/lib/validations/money";
import { incomeInclude, toIncomeDTO } from "@/server/queries/income";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult, IncomeDTO } from "@/types";

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Keeps the salary's "tax deducted by employer" entry in step with the income. */
async function syncSalaryTax(tx: Tx, userId: string, incomeId: string, type: string, date: Date, taxDeducted: string | undefined) {
  const amount = type === "SALARY" ? roundMoney(Number(taxDeducted || 0)) : 0;
  if (amount <= 0) {
    await tx.taxWithholding.deleteMany({ where: { userId, incomeId } });
    return;
  }
  const existing = await tx.taxWithholding.findFirst({ where: { userId, incomeId }, select: { id: true } });
  if (existing) {
    await tx.taxWithholding.update({ where: { id: existing.id }, data: { date, amount } });
  } else {
    await tx.taxWithholding.create({
      data: { userId, incomeId, date, type: "SALARY", section: WITHHOLDING_TYPES.SALARY.section, amount, adjustable: true },
    });
  }
}

async function toData(userId: string, v: IncomeFormValues) {
  if (v.walletId) {
    const w = await db.wallet.findFirst({ where: { id: v.walletId, userId }, select: { id: true } });
    if (!w) return null;
  }
  return {
    amount: roundMoney(Number(v.amount)),
    source: v.source,
    type: v.type,
    walletId: v.walletId || null,
    date: dateInputToUTC(v.date),
    notes: v.notes || null,
  };
}

const invalid = (e: import("zod").ZodError): ActionResult<never> => ({
  ok: false,
  error: "Please fix the highlighted fields.",
  fieldErrors: e.flatten().fieldErrors as Record<string, string[] | undefined>,
});
const badWallet: ActionResult<never> = {
  ok: false,
  error: "This wallet no longer exists.",
  fieldErrors: { walletId: ["Choose another wallet"] },
};

export async function createIncome(input: IncomeFormValues): Promise<ActionResult<IncomeDTO>> {
  const parsed = incomeFormSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  try {
    const data = await toData(user.id, parsed.data);
    if (!data) return badWallet;
    const row = await db.$transaction(async (tx) => {
      const created = await tx.income.create({ data: { ...data, userId: user.id } });
      await syncSalaryTax(tx, user.id, created.id, data.type, data.date, parsed.data.taxDeducted);
      return tx.income.findUniqueOrThrow({ where: { id: created.id }, include: incomeInclude });
    });
    revalidateAll();
    return { ok: true, data: toIncomeDTO(row), message: "Income added" };
  } catch (e) {
    console.error("create income failed", e);
    return { ok: false, error: "Couldn't add the income." };
  }
}

const fromProjectPayment: ActionResult<never> = {
  ok: false,
  error: "This came from a project payment. Undo it on the Goals page to change it.",
};

const isFromProjectPayment = async (userId: string, incomeId: string) =>
  (await db.expectedPayment.count({ where: { userId, incomeId } })) > 0;

export async function updateIncome(id: string, input: IncomeFormValues): Promise<ActionResult<IncomeDTO>> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid income." };
  const parsed = incomeFormSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  try {
    if (await isFromProjectPayment(user.id, id)) return fromProjectPayment;
    const data = await toData(user.id, parsed.data);
    if (!data) return badWallet;
    const row = await db.$transaction(async (tx) => {
      await tx.income.update({ where: { id, userId: user.id }, data });
      await syncSalaryTax(tx, user.id, id, data.type, data.date, parsed.data.taxDeducted);
      return tx.income.findUniqueOrThrow({ where: { id }, include: incomeInclude });
    });
    revalidateAll();
    return { ok: true, data: toIncomeDTO(row), message: "Income updated" };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, error: "This income no longer exists." };
    }
    console.error("update income failed", e);
    return { ok: false, error: "Couldn't update the income." };
  }
}

export async function deleteIncome(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid income." };
  const user = await requireUser();
  try {
    if (await isFromProjectPayment(user.id, id)) return fromProjectPayment;
    await db.$transaction([
      db.taxWithholding.deleteMany({ where: { userId: user.id, incomeId: id } }),
      db.income.delete({ where: { id, userId: user.id } }),
    ]);
    revalidateAll();
    return { ok: true, data: undefined, message: "Income deleted" };
  } catch (e) {
    console.error("delete income failed", e);
    return { ok: false, error: "Couldn't delete the income." };
  }
}
