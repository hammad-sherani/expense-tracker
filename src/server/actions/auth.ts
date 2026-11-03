"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { homeFor } from "@/lib/auth/jwt";
import { checkOtp, issueOtp, OTP_RESEND_COOLDOWN_SECONDS, resendCooldown } from "@/lib/auth/otp";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import {
  clearPendingVerification,
  createSession,
  deleteSession,
  readPendingVerification,
  setPendingVerification,
} from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  type LoginValues,
  loginSchema,
  type OtpValues,
  otpSchema,
  type SignupValues,
  signupSchema,
} from "@/lib/validations/auth";
import type { ActionResult } from "@/types";

type FieldErrors = Record<string, string[] | undefined>;

function invalid(fieldErrors: FieldErrors, error = "Please fix the highlighted fields."): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/* ------------------------------------------------------------------ */
/* Sign up                                                             */
/* ------------------------------------------------------------------ */

export async function signup(input: SignupValues): Promise<ActionResult<never>> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const username = parsed.data.username.toLowerCase();
  const email = parsed.data.email.toLowerCase();

  let user: { id: string; email: string; username: string };
  try {
    const [byEmail, byUsername] = await Promise.all([
      db.user.findUnique({ where: { email } }),
      db.user.findUnique({ where: { username } }),
    ]);

    if (byEmail?.emailVerified) {
      return invalid({ email: ["An account with this email already exists. Try logging in."] });
    }
    if (byUsername && byUsername.id !== byEmail?.id) {
      return invalid({ username: ["This username is already taken"] });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    // An unverified account with the same email is replaced, so a typo'd or
    // abandoned signup can simply be started again.
    user = byEmail
      ? await db.user.update({ where: { id: byEmail.id }, data: { username, passwordHash } })
      : await db.user.create({ data: { username, email, passwordHash, role: "USER" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return invalid({ username: ["This username or email is already taken"] });
    }
    console.error("signup failed", error);
    return { ok: false, error: "Could not create your account. Please try again." };
  }

  try {
    await issueOtp(user);
  } catch (error) {
    console.error("sending OTP failed", error);
    return {
      ok: false,
      error: "Your account was created but we couldn't send the verification email. Please try again shortly.",
    };
  }

  await setPendingVerification(user.id);
  redirect("/verify-email");
}

/* ------------------------------------------------------------------ */
/* Log in                                                              */
/* ------------------------------------------------------------------ */

export async function login(input: LoginValues): Promise<ActionResult<never>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const email = parsed.data.email.toLowerCase();
  const generic = { ok: false as const, error: "Invalid email or password." };

  let target: string;
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      await verifyAgainstDummy(parsed.data.password);
      return generic;
    }
    if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return generic;

    if (!user.emailVerified) {
      // Send a fresh code unless one was sent very recently (which is still valid).
      if ((await resendCooldown(user.id)) === 0) await issueOtp(user);
      await setPendingVerification(user.id);
      target = "/verify-email";
    } else {
      await createSession(user.id, user.role);
      target = homeFor(user.role);
    }
  } catch (error) {
    console.error("login failed", error);
    return { ok: false, error: "Something went wrong while signing in. Please try again." };
  }

  redirect(target);
}

/* ------------------------------------------------------------------ */
/* Email verification                                                  */
/* ------------------------------------------------------------------ */

const OTP_MESSAGES = {
  invalid: "That code is incorrect. Please check and try again.",
  expired: "This code has expired. Request a new one.",
  too_many_attempts: "Too many incorrect attempts. Request a new code.",
} as const;

export async function verifyEmail(input: OtpValues): Promise<ActionResult<never>> {
  const parsed = otpSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const pending = await readPendingVerification();
  if (!pending) {
    return { ok: false, error: "Your verification session expired. Please log in again to get a new code." };
  }

  let target: string;
  try {
    const user = await db.user.findUnique({ where: { id: pending.sub } });
    if (!user) return { ok: false, error: "Account not found. Please sign up again." };

    if (!user.emailVerified) {
      const result = await checkOtp(user.id, parsed.data.code);
      if (result !== "ok") return invalid({ code: [OTP_MESSAGES[result]] }, OTP_MESSAGES[result]);
      await db.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
    }

    await createSession(user.id, user.role);
    target = homeFor(user.role);
  } catch (error) {
    console.error("verify email failed", error);
    return { ok: false, error: "Could not verify your email. Please try again." };
  }

  redirect(target);
}

export async function resendVerificationCode(): Promise<ActionResult<{ cooldown: number }>> {
  const pending = await readPendingVerification();
  if (!pending) {
    return { ok: false, error: "Your verification session expired. Please log in again to get a new code." };
  }

  try {
    const user = await db.user.findUnique({ where: { id: pending.sub } });
    if (!user) return { ok: false, error: "Account not found. Please sign up again." };
    if (user.emailVerified) return { ok: false, error: "This email is already verified. You can log in." };

    const wait = await resendCooldown(user.id);
    if (wait > 0) return { ok: false, error: `Please wait ${wait}s before requesting another code.` };

    await issueOtp(user);
    // Extend the pending window so the new code can be used.
    await setPendingVerification(user.id);
    return { ok: true, data: { cooldown: OTP_RESEND_COOLDOWN_SECONDS }, message: "A new code is on its way." };
  } catch (error) {
    console.error("resend OTP failed", error);
    return { ok: false, error: "Couldn't send a new code. Please try again shortly." };
  }
}

/* ------------------------------------------------------------------ */
/* Log out                                                             */
/* ------------------------------------------------------------------ */

export async function logout() {
  await deleteSession();
  await clearPendingVerification();
  redirect("/login");
}
