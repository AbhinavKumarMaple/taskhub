"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ConfigError } from "@/server/errors";
import { clearLoginFailures, loginRetryAfter, recordLoginFailure } from "@/server/service";
import {
  checkOwnerPassword,
  createSessionToken,
  missingAuthEnv,
  safeNext,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/session";

export type LoginState = { error?: string };

/** The client's address as the platform reports it (first X-Forwarded-For hop on Vercel). */
function clientId(h: Headers): string {
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || h.get("x-real-ip")?.trim() || "unknown").slice(0, 64);
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const missing = missingAuthEnv();
  if (missing.length) return { error: `Not configured: set ${missing.join(", ")}.` };
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  const client = clientId(await headers());
  const wait = await loginRetryAfter(client);
  if (wait > 0) return { error: `Too many wrong passwords. Try again in ${Math.ceil(wait / 60)} min.` };
  try {
    if (!password || !checkOwnerPassword(password)) {
      await recordLoginFailure(client);
      await new Promise((r) => setTimeout(r, 400)); // slow down guessing
      return { error: "Wrong password" };
    }
  } catch (err) {
    if (err instanceof ConfigError) return { error: err.message };
    throw err;
  }
  await clearLoginFailures(client);
  (await cookies()).set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions());
  redirect(next);
}
