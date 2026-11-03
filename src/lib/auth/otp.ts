import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { otpEmail, sendEmail } from "@/lib/email";

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

function hashCode(userId: string, code: string) {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`${userId}:${code}`).digest("hex");
}

/** Seconds until another code may be sent (0 = can send now). */
export async function resendCooldown(userId: string) {
  const latest = await db.emailOtp.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  if (!latest) return 0;
  const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed));
}

/** Creates a fresh code (replacing any previous one) and emails it. */
export async function issueOtp(user: { id: string; email: string; username: string }) {
  const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
  await db.emailOtp.deleteMany({ where: { userId: user.id } });
  await db.emailOtp.create({
    data: {
      userId: user.id,
      codeHash: hashCode(user.id, code),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
    },
  });
  await sendEmail({ to: user.email, ...otpEmail(user.username, code, OTP_TTL_MINUTES) });
}

export type OtpCheck = "ok" | "invalid" | "expired" | "too_many_attempts";

export async function checkOtp(userId: string, code: string): Promise<OtpCheck> {
  const otp = await db.emailOtp.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  if (!otp || otp.expiresAt < new Date()) return "expired";
  if (otp.attempts >= OTP_MAX_ATTEMPTS) return "too_many_attempts";

  const expected = Buffer.from(otp.codeHash, "hex");
  const actual = Buffer.from(hashCode(userId, code), "hex");
  if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
    await db.emailOtp.deleteMany({ where: { userId } });
    return "ok";
  }

  const updated = await db.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
  return updated.attempts >= OTP_MAX_ATTEMPTS ? "too_many_attempts" : "invalid";
}
