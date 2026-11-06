"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { getCurrentUser, requireUser } from "@/lib/auth/dal";
import { checkOtp, issueOtp, OTP_RESEND_COOLDOWN_SECONDS, resendCooldown } from "@/lib/auth/otp";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { currentYearMonth, shiftMonth } from "@/lib/dates";
import {
  type ChangeEmailValues,
  type ChangePasswordValues,
  changeEmailSchema,
  changePasswordSchema,
  changeUsernameSchema,
  deleteAccountSchema,
  otpSchema,
} from "@/lib/validations/auth";
import { revalidateAll } from "@/server/revalidate";
import type { ActionResult } from "@/types";

type FieldErrors = Record<string, string[] | undefined>;
const invalid = (fieldErrors: FieldErrors, error = "Please fix the highlighted fields."): ActionResult<never> => ({
  ok: false,
  error,
  fieldErrors,
});
const wrongPassword = (field: string) => invalid({ [field]: ["Incorrect password"] }, "That password is incorrect.");

/** Works for regular users and the admin alike. */
async function currentAccount() {
  const me = await getCurrentUser();
  if (!me) redirect("/api/auth/session-expired");
  return db.user.findUniqueOrThrow({ where: { id: me.id } });
}

export async function changeUsername(input: { username: string }): Promise<ActionResult> {
  const parsed = changeUsernameSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const user = await currentAccount();
  const username = parsed.data.username.toLowerCase();
  if (username === user.username) return { ok: true, data: undefined, message: "Username unchanged" };
  try {
    await db.user.update({ where: { id: user.id }, data: { username } });
    revalidateAll();
    return { ok: true, data: undefined, message: "Username updated" };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return invalid({ username: ["This username is already taken"] }, "This username is already taken.");
    }
    console.error("change username failed", e);
    return { ok: false, error: "Couldn't update your username." };
  }
}

/** Step 1: confirm the password, then email a code to the new address. */
export async function requestEmailChange(input: ChangeEmailValues): Promise<ActionResult<{ cooldown: number }>> {
  const parsed = changeEmailSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const user = await currentAccount();
  const email = parsed.data.email.toLowerCase();
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) return wrongPassword("currentPassword");
  if (email === user.email) return invalid({ email: ["This is already your email"] }, "This is already your email.");
  try {
    const taken = await db.user.findUnique({ where: { email }, select: { id: true, emailVerified: true } });
    if (taken?.emailVerified) {
      return invalid({ email: ["Another account uses this email"] }, "Another account already uses this email.");
    }
    const wait = await resendCooldown(user.id, "CHANGE_EMAIL");
    if (wait > 0) return { ok: false, error: `Please wait ${wait}s before requesting another code.` };
    await issueOtp(user, "CHANGE_EMAIL", email);
    revalidateAll();
    return { ok: true, data: { cooldown: OTP_RESEND_COOLDOWN_SECONDS }, message: `We sent a code to ${email}` };
  } catch (e) {
    console.error("request email change failed", e);
    return { ok: false, error: "Couldn't send the code. Please try again shortly." };
  }
}

/** Step 2: the code proves the new address belongs to the user. */
export async function confirmEmailChange(input: { code: string }): Promise<ActionResult> {
  const parsed = otpSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const user = await currentAccount();
  try {
    const { result, newEmail } = await checkOtp(user.id, parsed.data.code, "CHANGE_EMAIL");
    const messages = {
      invalid: "That code is incorrect.",
      expired: "This code has expired. Request a new one.",
      too_many_attempts: "Too many incorrect attempts. Request a new code.",
    } as const;
    if (result !== "ok" || !newEmail) {
      const message = messages[result === "ok" ? "expired" : result];
      return invalid({ code: [message] }, message);
    }
    // An unverified signup that was using this address is abandoned; free the address.
    await db.user.deleteMany({
      where: { email: newEmail, OR: [{ emailVerified: null }, { emailVerified: { isSet: false } }], id: { not: user.id } },
    });
    await db.user.update({ where: { id: user.id }, data: { email: newEmail, emailVerified: new Date() } });
    revalidateAll();
    return { ok: true, data: undefined, message: `Your login email is now ${newEmail}` };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Another account already uses this email." };
    }
    console.error("confirm email change failed", e);
    return { ok: false, error: "Couldn't change your email." };
  }
}

export async function cancelEmailChange(): Promise<ActionResult> {
  const user = await currentAccount();
  await db.emailOtp.deleteMany({ where: { userId: user.id, purpose: "CHANGE_EMAIL" } });
  revalidateAll();
  return { ok: true, data: undefined, message: "Email change cancelled" };
}

/** Changes the password and logs out every other device. */
export async function changePassword(input: ChangePasswordValues): Promise<ActionResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const user = await currentAccount();
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) return wrongPassword("currentPassword");
  try {
    const updated = await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.password), sessionVersion: (user.sessionVersion ?? 0) + 1 },
    });
    // Keep this device signed in with the new session version.
    await createSession(updated.id, updated.role, updated.sessionVersion);
    return { ok: true, data: undefined, message: "Password changed. Other devices have been logged out." };
  } catch (e) {
    console.error("change password failed", e);
    return { ok: false, error: "Couldn't change your password." };
  }
}

export async function setMonthlyReportEmail(enabled: boolean): Promise<ActionResult> {
  const user = await requireUser();
  // Start with the month that ends next, rather than emailing last month right away.
  const now = currentYearMonth();
  const last = shiftMonth(now.year, now.month, -1);
  const lastKey = `${last.year}-${String(last.month).padStart(2, "0")}`;
  await db.user.update({
    where: { id: user.id },
    data: { monthlyReportEmail: enabled, ...(enabled ? { lastReportMonth: lastKey } : {}) },
  });
  revalidateAll();
  return {
    ok: true,
    data: undefined,
    message: enabled ? "You'll get a PDF report by email when each month ends" : "Monthly report emails turned off",
  };
}

/** Permanently deletes the account and all of its data. */
export async function deleteAccount(input: { password: string }): Promise<ActionResult<never>> {
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const user = await requireUser();
  const account = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(parsed.data.password, account.passwordHash))) return wrongPassword("password");
  try {
    // Relations cascade: expenses, dues, payments, friends, categories, wallets, income...
    await db.user.delete({ where: { id: user.id } });
  } catch (e) {
    console.error("delete account failed", e);
    return { ok: false, error: "Couldn't delete your account. Please try again." };
  }
  await deleteSession();
  redirect("/login?deleted=1");
}
