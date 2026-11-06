/**
 * Signed JWT helpers (HS256). No Node-only APIs, so the proxy can use them too.
 */
import { jwtVerify, SignJWT } from "jose";

export type Role = "USER" | "ADMIN";

export const SESSION_COOKIE = "session";
/** Short-lived cookie that remembers which account is waiting for email verification. */
export const PENDING_COOKIE = "pending_verification";
/** Short-lived cookie for the forgot-password flow. */
export const RESET_COOKIE = "pending_reset";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const PENDING_TTL_SECONDS = 60 * 30; // 30 minutes

/** `sv` must match the user's sessionVersion; bumping it logs out every session. */
export type SessionPayload = { sub: string; role: Role; sv: number; typ: "session" };
export type PendingPayload = { sub: string; typ: "pending" };
/** `sub` is empty when no account has the email (so the response looks the same). */
export type ResetPayload = { sub: string; email: string; typ: "reset" };
type AnyPayload = SessionPayload | PendingPayload | ResetPayload;

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: AnyPayload, ttlSeconds: number) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey());
}

export async function verifyToken<T extends AnyPayload>(
  token: string | undefined,
  typ: T["typ"],
): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.typ !== typ || typeof payload.sub !== "string") return null;
    return payload as unknown as T;
  } catch {
    return null;
  }
}

export function homeFor(role: Role) {
  return role === "ADMIN" ? "/admin" : "/";
}
