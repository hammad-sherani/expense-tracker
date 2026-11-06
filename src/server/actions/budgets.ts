"use server";

import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { roundMoney } from "@/lib/format";
import { type BudgetValues, budgetSchema, objectId } from "@/lib/validations/money";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult } from "@/types";

/** Creates the budget, or updates it if that category already has one. */
export async function saveBudget(input: BudgetValues, id?: string): Promise<ActionResult> {
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (id && !objectId.safeParse(id).success) return { ok: false, error: "Invalid budget." };
  const user = await requireUser();
  const categoryId = parsed.data.categoryId || null;
  const amount = roundMoney(Number(parsed.data.amount));

  try {
    if (categoryId) {
      const category = await db.category.findFirst({ where: { id: categoryId, userId: user.id } });
      if (!category) return { ok: false, error: "Choose a category.", fieldErrors: { categoryId: ["Choose a category"] } };
    }
    if (id) {
      await db.budget.update({ where: { id, userId: user.id }, data: { categoryId, amount } });
    } else {
      const existing = await db.budget.findFirst({
        where: {
          userId: user.id,
          ...(categoryId ? { categoryId } : { OR: [{ categoryId: null }, { categoryId: { isSet: false } }] }),
        },
      });
      if (existing) await db.budget.update({ where: { id: existing.id }, data: { amount } });
      else await db.budget.create({ data: { userId: user.id, categoryId, amount } });
    }
    revalidateAll();
    return { ok: true, data: undefined, message: "Budget saved" };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "That category already has a budget.", fieldErrors: { categoryId: ["Already has a budget"] } };
    }
    console.error("save budget failed", e);
    return { ok: false, error: "Couldn't save the budget." };
  }
}

export async function deleteBudget(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid budget." };
  const user = await requireUser();
  try {
    await db.budget.delete({ where: { id, userId: user.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Budget removed" };
  } catch (e) {
    console.error("delete budget failed", e);
    return { ok: false, error: "Couldn't remove the budget." };
  }
}
