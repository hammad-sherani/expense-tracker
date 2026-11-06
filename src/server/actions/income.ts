"use server";

import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { dateInputToUTC } from "@/lib/dates";
import { roundMoney } from "@/lib/format";
import { type IncomeFormValues, incomeFormSchema, objectId } from "@/lib/validations/money";
import { incomeInclude, toIncomeDTO } from "@/server/queries/income";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult, IncomeDTO } from "@/types";

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
    const row = await db.income.create({ data: { ...data, userId: user.id }, include: incomeInclude });
    revalidateAll();
    return { ok: true, data: toIncomeDTO(row), message: "Income added" };
  } catch (e) {
    console.error("create income failed", e);
    return { ok: false, error: "Couldn't add the income." };
  }
}

export async function updateIncome(id: string, input: IncomeFormValues): Promise<ActionResult<IncomeDTO>> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid income." };
  const parsed = incomeFormSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const user = await requireUser();
  try {
    const data = await toData(user.id, parsed.data);
    if (!data) return badWallet;
    const row = await db.income.update({ where: { id, userId: user.id }, data, include: incomeInclude });
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
    await db.income.delete({ where: { id, userId: user.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Income deleted" };
  } catch (e) {
    console.error("delete income failed", e);
    return { ok: false, error: "Couldn't delete the income." };
  }
}
