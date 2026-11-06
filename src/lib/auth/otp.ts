import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { OtpPurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { otpEmail, sendEmail } from "@/lib/email";

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

function hashCode(userId: string, code: string, purpose: OtpPurpose) {
  // The purpose is part of the hash, so a signup code can't be used to reset a password.
  const scope = purpose === "VERIFY_EMAIL" ? "" : `${purpose}:`;
  return createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`${scope}${userId}:${code}`).digest("hex");
}

/** Codes created before purposes existed have none and count as VERIFY_EMAIL. */
function purposeWhere(purpose: OtpPurpose) {
  return purpose === "VERIFY_EMAIL"
    ? { OR: [{ purpose: "VERIFY_EMAIL" as const }, { purpose: { isSet: false } }, { purpose: null }] }
    : { purpose };
}

/** Seconds until another code may be sent (0 = can send now). */
export async function resendCooldown(userId: string, purpose: OtpPurpose = "VERIFY_EMAIL") {
  const latest = await db.emailOtp.findFirst({
    where: { userId, ...purposeWhere(purpose) },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return 0;
  const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed));
}

/**
 * Creates a fresh code (replacing any previous one for the same purpose) and emails it.
 * CHANGE_EMAIL codes go to `newEmail`, the address being confirmed.
 */
export async function issueOtp(
  user: { id: string; email: string; username: string },
  purpose: OtpPurpose = "VERIFY_EMAIL",
  newEmail?: string,
) {
  const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
  await db.emailOtp.deleteMany({ where: { userId: user.id, ...purposeWhere(purpose) } });
  await db.emailOtp.create({
    data: {
      userId: user.id,
      purpose,
      newEmail: newEmail ?? null,
      codeHash: hashCode(user.id, code, purpose),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
    },
  });
  await sendEmail({ to: newEmail ?? user.email, ...otpEmail(user.username, code, OTP_TTL_MINUTES, purpose) });
}

export type OtpCheck = "ok" | "invalid" | "expired" | "too_many_attempts";

/** The latest pending CHANGE_EMAIL request, so settings can show "waiting for code". */
export async function pendingEmailChange(userId: string) {
  const otp = await db.emailOtp.findFirst({
    where: { userId, purpose: "CHANGE_EMAIL", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { newEmail: true },
  });
  return otp?.newEmail ?? null;
}

export async function checkOtp(
  userId: string,
  code: string,
  purpose: OtpPurpose = "VERIFY_EMAIL",
): Promise<{ result: OtpCheck; newEmail: string | null }> {
  const otp = await db.emailOtp.findFirst({
    where: { userId, ...purposeWhere(purpose) },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt < new Date()) return { result: "expired", newEmail: null };
  if (otp.attempts >= OTP_MAX_ATTEMPTS) return { result: "too_many_attempts", newEmail: null };

  const expected = Buffer.from(otp.codeHash, "hex");
  const actual = Buffer.from(hashCode(userId, code, purpose), "hex");
  if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
    await db.emailOtp.deleteMany({ where: { userId, ...purposeWhere(purpose) } });
    return { result: "ok", newEmail: otp.newEmail };
  }

  const updated = await db.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
  return { result: updated.attempts >= OTP_MAX_ATTEMPTS ? "too_many_attempts" : "invalid", newEmail: null };
}
