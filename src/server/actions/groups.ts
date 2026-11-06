"use server";

import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { type GroupValues, groupSchema, objectId } from "@/lib/validations/money";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult } from "@/types";

async function ownMembers(userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const count = await db.friend.count({ where: { userId, id: { in: unique } } });
  return count === unique.length ? unique : null;
}

export async function createGroup(input: GroupValues): Promise<ActionResult<{ id: string }>> {
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const user = await requireUser();
  const members = await ownMembers(user.id, parsed.data.memberIds);
  if (!members) return { ok: false, error: "Some people no longer exist. Please choose again." };
  try {
    const g = await db.group.create({
      data: { userId: user.id, name: parsed.data.name, emoji: parsed.data.emoji || null, memberIds: members },
    });
    revalidateAll();
    return { ok: true, data: { id: g.id }, message: `Group "${g.name}" created` };
  } catch (e) {
    console.error("create group failed", e);
    return { ok: false, error: "Couldn't create the group." };
  }
}

export async function updateGroup(id: string, input: GroupValues): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid group." };
  const parsed = groupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const user = await requireUser();
  const members = await ownMembers(user.id, parsed.data.memberIds);
  if (!members) return { ok: false, error: "Some people no longer exist. Please choose again." };
  try {
    await db.group.update({
      where: { id, userId: user.id },
      data: { name: parsed.data.name, emoji: parsed.data.emoji || null, memberIds: members },
    });
    revalidateAll();
    return { ok: true, data: undefined, message: "Group updated" };
  } catch (e) {
    console.error("update group failed", e);
    return { ok: false, error: "Couldn't update the group." };
  }
}

export async function setGroupArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid group." };
  const user = await requireUser();
  try {
    await db.group.update({ where: { id, userId: user.id }, data: { archivedAt: archived ? new Date() : null } });
    revalidateAll();
    return { ok: true, data: undefined, message: archived ? "Group archived" : "Group restored" };
  } catch (e) {
    console.error("archive group failed", e);
    return { ok: false, error: "Couldn't update the group." };
  }
}

/** Deletes the group only; its expenses and dues stay (they just leave the group). */
export async function deleteGroup(id: string): Promise<ActionResult> {
  if (!objectId.safeParse(id).success) return { ok: false, error: "Invalid group." };
  const user = await requireUser();
  try {
    await db.group.delete({ where: { id, userId: user.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Group deleted. Its expenses were kept." };
  } catch (e) {
    console.error("delete group failed", e);
    return { ok: false, error: "Couldn't delete the group." };
  }
}
