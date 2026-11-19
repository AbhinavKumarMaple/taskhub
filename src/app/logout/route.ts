import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/session";

/** No Origin header (old clients) is allowed; a present one must name this host. */
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  } catch {
    return false;
  }
}

function signOut(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", request.url), 303);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
  return res;
}

/** Sign out (the sidebar posts here). POST only, so another site cannot sign the owner out with a link. */
export function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse("Cross-site sign-out refused", { status: 403 });
  return signOut(request);
}

/** A plain visit to /logout does not sign out; it goes back to the app. */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/board?type=feature", request.url), 303);
}
