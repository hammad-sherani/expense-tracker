import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { homeFor, type Role } from "@/lib/auth/jwt";
import { readSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ensureUserUpgraded } from "@/server/defaults";

export type CurrentUser = {
  id: string;
  username: string;
  email: string;
  role: Role;
};

/**
 * Data Access Layer: reads the session cookie and confirms the user still
 * exists and is verified. Deduplicated per request with React `cache`.
 * The proxy only does optimistic redirects; this is the real check.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      emailVerified: true,
      sessionVersion: true,
      blockedAt: true,
      lastActiveAt: true,
    },
  });
  if (!user || !user.emailVerified || user.blockedAt) return null;
  // A password change/reset or a block bumps the version and ends older sessions.
  if ((session.sv ?? 0) !== (user.sessionVersion ?? 0)) return null;
  touchLastActive(user.id, user.lastActiveAt);
  return { id: user.id, username: user.username, email: user.email, role: user.role };
});

const ACTIVE_EVERY_MS = 10 * 60_000;

/** Records activity for the admin stats, at most every 10 minutes per user. Never blocks the request. */
function touchLastActive(userId: string, last: Date | null) {
  if (last && Date.now() - last.getTime() < ACTIVE_EVERY_MS) return;
  db.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } }).catch(() => {});
}

/** For expense-tracker pages and actions: a signed-in, verified regular user. */
/** No valid user: clear a stale cookie first, otherwise the proxy would bounce /login back here. */
async function redirectToLogin(): Promise<never> {
  redirect((await readSession()) ? "/api/auth/session-expired" : "/login");
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) return redirectToLogin();
  if (user.role !== "USER") redirect(homeFor(user.role));
  await ensureUpgraded(user.id);
  return user;
}

/** v1 accounts get categories and wallets the first time they're used (once per request). */
const ensureUpgraded = cache((userId: string) => ensureUserUpgraded(userId));

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) return redirectToLogin();
  if (user.role !== "ADMIN") redirect(homeFor(user.role));
  return user;
}
