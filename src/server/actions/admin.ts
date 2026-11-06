"use server";

import { requireAdmin } from "@/lib/auth/dal";
import { issueOtp } from "@/lib/auth/otp";
import { db } from "@/lib/db";
import { objectId } from "@/lib/validations/money";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult } from "@/types";

/** Admins can only act on regular user accounts, never on themselves or other admins. */
async function target(id: string) {
  const admin = await requireAdmin();
  if (!objectId.safeParse(id).success || id === admin.id) return null;
  return db.user.findFirst({ where: { id, role: "USER" } });
}

/** Blocking logs the user out everywhere (session version bump) and stops them logging in. */
export async function setUserBlocked(id: string, blocked: boolean): Promise<ActionResult> {
  const user = await target(id);
  if (!user) return { ok: false, error: "This account can't be changed." };
  try {
    await db.user.update({
      where: { id: user.id },
      data: blocked
        ? { blockedAt: new Date(), sessionVersion: (user.sessionVersion ?? 0) + 1 }
        : { blockedAt: null },
    });
    revalidateAll();
    return { ok: true, data: undefined, message: blocked ? `${user.username} is blocked` : `${user.username} is unblocked` };
  } catch (e) {
    console.error("block user failed", e);
    return { ok: false, error: "Couldn't update the account." };
  }
}

export async function resendUserVerification(id: string): Promise<ActionResult> {
  const user = await target(id);
  if (!user) return { ok: false, error: "This account can't be changed." };
  if (user.emailVerified) return { ok: false, error: "This email is already verified." };
  try {
    await issueOtp(user);
    return { ok: true, data: undefined, message: `Verification code sent to ${user.email}` };
  } catch (e) {
    console.error("resend verification failed", e);
    return { ok: false, error: "Couldn't send the email." };
  }
}

export async function deleteUserAccount(id: string): Promise<ActionResult> {
  const user = await target(id);
  if (!user) return { ok: false, error: "This account can't be deleted." };
  try {
    await db.user.delete({ where: { id: user.id } });
    revalidateAll();
    return { ok: true, data: undefined, message: `${user.username}'s account was deleted` };
  } catch (e) {
    console.error("admin delete user failed", e);
    return { ok: false, error: "Couldn't delete the account." };
  }
}
