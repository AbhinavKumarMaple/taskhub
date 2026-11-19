"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ConfigError } from "@/server/errors";
import {
  checkOwnerPassword,
  createSessionToken,
  missingAuthEnv,
  safeNext,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/server/session";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const missing = missingAuthEnv();
  if (missing.length) return { error: `Not configured: set ${missing.join(", ")}.` };
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  try {
    if (!password || !checkOwnerPassword(password)) {
      await new Promise((r) => setTimeout(r, 400)); // slow down guessing
      return { error: "Wrong password" };
    }
  } catch (err) {
    if (err instanceof ConfigError) return { error: err.message };
    throw err;
  }
  (await cookies()).set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions());
  redirect(next);
}
