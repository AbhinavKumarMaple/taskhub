import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/session";

function signOut(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", request.url), 303);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
  return res;
}

/** Sign out (the sidebar posts here). */
export function POST(request: NextRequest) {
  return signOut(request);
}

export function GET(request: NextRequest) {
  return signOut(request);
}
