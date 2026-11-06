import "server-only";
import { cookies } from "next/headers";
import {
  PENDING_COOKIE,
  PENDING_TTL_SECONDS,
  type PendingPayload,
  RESET_COOKIE,
  type ResetPayload,
  type Role,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type SessionPayload,
  signToken,
  verifyToken,
} from "@/lib/auth/jwt";

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function createSession(userId: string, role: Role, sessionVersion: number | null) {
  const token = await signToken({ sub: userId, role, sv: sessionVersion ?? 0, typ: "session" }, SESSION_TTL_SECONDS);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { ...cookieBase, maxAge: SESSION_TTL_SECONDS });
  store.delete(PENDING_COOKIE);
}

export async function readSession() {
  const store = await cookies();
  return verifyToken<SessionPayload>(store.get(SESSION_COOKIE)?.value, "session");
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Remember which account is verifying its email, without putting the email in the URL. */
export async function setPendingVerification(userId: string) {
  const token = await signToken({ sub: userId, typ: "pending" }, PENDING_TTL_SECONDS);
  (await cookies()).set(PENDING_COOKIE, token, { ...cookieBase, maxAge: PENDING_TTL_SECONDS });
}

export async function readPendingVerification() {
  const store = await cookies();
  return verifyToken<PendingPayload>(store.get(PENDING_COOKIE)?.value, "pending");
}

export async function clearPendingVerification() {
  (await cookies()).delete(PENDING_COOKIE);
}

/** Remember which account is resetting its password (sub "" = no such account). */
export async function setPendingReset(userId: string, email: string) {
  const token = await signToken({ sub: userId, email, typ: "reset" }, PENDING_TTL_SECONDS);
  (await cookies()).set(RESET_COOKIE, token, { ...cookieBase, maxAge: PENDING_TTL_SECONDS });
}

export async function readPendingReset() {
  const store = await cookies();
  return verifyToken<ResetPayload>(store.get(RESET_COOKIE)?.value, "reset");
}

export async function clearPendingReset() {
  (await cookies()).delete(RESET_COOKIE);
}
