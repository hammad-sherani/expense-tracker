import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { homeFor, type Role } from "@/lib/auth/jwt";
import { readSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

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
    select: { id: true, username: true, email: true, role: true, emailVerified: true },
  });
  if (!user || !user.emailVerified) return null;
  return { id: user.id, username: user.username, email: user.email, role: user.role };
});

/** For expense-tracker pages and actions: a signed-in, verified regular user. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "USER") redirect(homeFor(user.role));
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect(homeFor(user.role));
  return user;
}
