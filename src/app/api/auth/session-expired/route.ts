import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/jwt";

/**
 * Clears a session cookie that is still signed but no longer valid (password
 * changed elsewhere, account blocked or deleted), then sends the user to log in.
 * Pages can't delete cookies while rendering, so the DAL redirects here.
 */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
