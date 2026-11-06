"use server";

import { Prisma } from "@prisma/client";
import { refresh, revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { friendNameSchema } from "@/lib/validations/dues";
import { objectIdSchema } from "@/lib/validations/expense";
import { listFriends } from "@/server/queries/friends";
import type { ActionResult, FriendDTO } from "@/types";

const select = { id: true, name: true } as const;

/** Friends for the split picker (loaded on demand by the expense form). */
export async function listMyFriends(): Promise<FriendDTO[]> {
  const user = await requireUser();
  return listFriends(user.id);
}

/** Adds a friend, or returns the existing one with the same name (case-insensitive). */
export async function createFriend(name: string): Promise<ActionResult<FriendDTO>> {
  const parsed = friendNameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const user = await requireUser();
  const nameKey = parsed.data.toLowerCase();

  try {
    const friend = await db.friend.upsert({
      where: { userId_nameKey: { userId: user.id, nameKey } },
      create: { userId: user.id, name: parsed.data, nameKey },
      update: {},
      select,
    });
    return { ok: true, data: friend };
  } catch (error) {
    console.error("create friend failed", error);
    return { ok: false, error: "Couldn't add this friend. Please try again." };
  }
}

export async function renameFriend(id: string, name: string): Promise<ActionResult<FriendDTO>> {
  const idResult = objectIdSchema.safeParse(id);
  const parsed = friendNameSchema.safeParse(name);
  if (!idResult.success) return { ok: false, error: "Invalid friend." };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const user = await requireUser();

  try {
    const friend = await db.friend.update({
      where: { id: idResult.data, userId: user.id },
      data: { name: parsed.data, nameKey: parsed.data.toLowerCase() },
      select,
    });
    revalidatePath("/", "layout");
    refresh();
    return { ok: true, data: friend, message: "Friend renamed" };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "You already have a friend with this name." };
    }
    console.error("rename friend failed", error);
    return { ok: false, error: "Couldn't rename this friend." };
  }
}

/** Deleting is only allowed once nothing is owed either way. Settled history is removed with the friend. */
export async function deleteFriend(id: string): Promise<ActionResult> {
  const idResult = objectIdSchema.safeParse(id);
  if (!idResult.success) return { ok: false, error: "Invalid friend." };
  const user = await requireUser();

  try {
    const dues = await db.due.findMany({
      where: { userId: user.id, friendId: idResult.data },
      select: { amount: true, paidAmount: true },
    });
    if (dues.some((d) => Math.round((d.amount - d.paidAmount) * 100) > 0)) {
      return { ok: false, error: "Settle everything with this friend before removing them." };
    }
    await db.friend.delete({ where: { id: idResult.data, userId: user.id } });
    revalidatePath("/", "layout");
    refresh();
    return { ok: true, data: undefined, message: "Friend removed" };
  } catch (error) {
    console.error("delete friend failed", error);
    return { ok: false, error: "Couldn't remove this friend." };
  }
}
