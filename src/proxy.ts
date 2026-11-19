import { NextResponse, type NextRequest } from "next/server";
import { missingAuthEnv, SESSION_COOKIE, verifySessionToken } from "./server/session";

/**
 * Optimistic page guard: no valid owner cookie → /login?next=…
 * /login, /logout and /api/* are excluded (API routes check auth themselves);
 * pages and Server Actions re-check with requireOwner().
 */
export function proxy(request: NextRequest) {
  const missing = missingAuthEnv();
  if (missing.length) {
    return new NextResponse(
      `Taskhub is not configured: set ${missing.join(", ")} in the environment and redeploy.`,
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // everything except API, login/logout, Next internals and static files
    "/((?!api/|login|logout|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|woff2?)$).*)",
  ],
};
