import "server-only";
import { cookies } from "next/headers";
import {
  PENDING_COOKIE,
  PENDING_TTL_SECONDS,
  type PendingPayload,
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

export async function createSession(userId: string, role: Role) {
  const token = await signToken({ sub: userId, role, typ: "session" }, SESSION_TTL_SECONDS);
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
