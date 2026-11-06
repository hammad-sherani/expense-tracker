"use server";

import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { type CategoryValues, categorySchema, objectId } from "@/lib/validations/money";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult, CategoryDTO } from "@/types";

const dup = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const nameTaken = { ok: false as const, error: "You already have a category with this name.", fieldErrors: { name: ["Name already used"] } };

function toDTO(c: { id: string; name: string; icon: string; color: string; archivedAt: Date | null }): CategoryDTO {
  return { id: c.id, name: c.name, icon: c.icon, color: c.color, archived: Boolean(c.archivedAt) };
}

export async function createCategory(input: CategoryValues): Promise<ActionResult<CategoryDTO>> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  const user = await requireUser();
  try {
    const last = await db.category.findFirst({ where: { userId: user.id }, orderBy: { sortOrder: "desc" } });
    const created = await db.category.create({
      data: {
        userId: user.id,
        ...parsed.data,
        nameKey: parsed.data.name.toLowerCase(),
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    revalidateAll();
    return { ok: true, data: toDTO(created), message: `Category "${created.name}" added` };
  } catch (e) {
    if (dup(e)) return nameTaken;
    console.error("create category failed", e);
    return { ok: false, error: "Couldn't add the category. Please try again." };
  }
}

export async function updateCategory(id: string, input: CategoryValues): Promise<ActionResult<CategoryDTO>> {
  const idOk = objectId.safeParse(id);
  const parsed = categorySchema.safeParse(input);
  if (!idOk.success) return { ok: false, error: "Invalid category." };
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  const user = await requireUser();
  try {
    const updated = await db.category.update({
      where: { id, userId: user.id },
      data: { ...parsed.data, nameKey: parsed.data.name.toLowerCase() },
    });
    revalidateAll();
    return { ok: true, data: toDTO(updated), message: "Category updated" };
  } catch (e) {
    if (dup(e)) return nameTaken;
    console.error("update category failed", e);
    return { ok: false, error: "Couldn't update the category." };
  }
}

/** Archived categories disappear from pickers but keep their expenses and history. */
export async function setCategoryArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid category." };
  const user = await requireUser();
  try {
    if (archived) {
      // On MongoDB `archivedAt: null` misses documents without the field, so check both.
      const active = await db.category.count({
        where: { userId: user.id, OR: [{ archivedAt: null }, { archivedAt: { isSet: false } }] },
      });
      if (active <= 1) return { ok: false, error: "Keep at least one active category." };
    }
    const c = await db.category.update({
      where: { id, userId: user.id },
      data: { archivedAt: archived ? new Date() : null },
    });
    revalidateAll();
    return { ok: true, data: undefined, message: archived ? `"${c.name}" archived` : `"${c.name}" restored` };
  } catch (e) {
    console.error("archive category failed", e);
    return { ok: false, error: "Couldn't update the category." };
  }
}

/**
 * Deletes a category. If expenses use it, `moveToId` must name another of the
 * user's categories; those expenses are moved there first.
 */
export async function deleteCategory(id: string, moveToId?: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid category." };
  const user = await requireUser();
  try {
    const result = await db.$transaction(async (tx) => {
      const category = await tx.category.findFirst({ where: { id, userId: user.id } });
      if (!category) return { ok: false as const, error: "This category no longer exists." };
      const total = await tx.category.count({ where: { userId: user.id } });
      if (total <= 1) return { ok: false as const, error: "You need at least one category." };

      const used = await tx.expense.count({ where: { userId: user.id, categoryId: id } });
      if (used > 0) {
        if (!moveToId || moveToId === id || !objectId.safeParse(moveToId).success) {
          return { ok: false as const, error: `${used} expense${used === 1 ? " uses" : "s use"} this category. Choose where to move them.` };
        }
        const target = await tx.category.findFirst({ where: { id: moveToId, userId: user.id } });
        if (!target) return { ok: false as const, error: "Choose a category to move the expenses to." };
        await tx.expense.updateMany({ where: { userId: user.id, categoryId: id }, data: { categoryId: moveToId } });
      }
      await tx.category.delete({ where: { id } });
      return { ok: true as const, data: undefined, message: used ? `Deleted. ${used} expense${used === 1 ? "" : "s"} moved.` : "Category deleted" };
    });
    if (result.ok) revalidateAll();
    return result;
  } catch (e) {
    console.error("delete category failed", e);
    return { ok: false, error: "Couldn't delete the category." };
  }
}

/** Saves a new order (ids top to bottom). */
export async function reorderCategories(ids: string[]): Promise<ActionResult> {
  if (!ids.every((i) => objectId.safeParse(i).success) || ids.length > 200) return { ok: false, error: "Invalid order." };
  const user = await requireUser();
  try {
    await db.$transaction(
      ids.map((id, i) => db.category.updateMany({ where: { id, userId: user.id }, data: { sortOrder: i } })),
    );
    revalidateAll();
    return { ok: true, data: undefined };
  } catch (e) {
    console.error("reorder categories failed", e);
    return { ok: false, error: "Couldn't save the order." };
  }
}
