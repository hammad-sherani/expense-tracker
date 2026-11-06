import { type NextRequest, NextResponse } from "next/server";
import { homeFor, SESSION_COOKIE, type SessionPayload, verifyToken } from "@/lib/auth/jwt";

const GUEST_ONLY = ["/login", "/signup", "/forgot-password", "/reset-password"];
const PUBLIC = [...GUEST_ONLY, "/verify-email"];

const matches = (pathname: string, routes: string[]) =>
  routes.some((r) => pathname === r || pathname.startsWith(`${r}/`));

/**
 * Optimistic route protection based on the signed session cookie only (no DB).
 * Pages, Server Actions and API routes still verify the user via the DAL.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifyToken<SessionPayload>(request.cookies.get(SESSION_COOKIE)?.value, "session");
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (!session) {
    return matches(pathname, PUBLIC) ? NextResponse.next() : redirectTo("/login");
  }

  if (matches(pathname, GUEST_ONLY)) return redirectTo(homeFor(session.role));

  const isAdminArea = matches(pathname, ["/admin"]);
  if (session.role === "ADMIN" && !isAdminArea && !matches(pathname, PUBLIC)) return redirectTo(homeFor("ADMIN"));
  if (session.role === "USER" && isAdminArea) return redirectTo(homeFor("USER"));

  return NextResponse.next();
}

export const config = {
  // Everything except API routes (they check auth themselves), Next internals and static files.
  // PWA files (service worker, manifest, offline page) must load without a session.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|offline\\.html|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
