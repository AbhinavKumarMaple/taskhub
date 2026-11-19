/**
 * Pure auth primitives (no Next imports) — used by src/proxy.ts, src/server/auth.ts and tests.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ConfigError } from "./errors";

export const SESSION_COOKIE = "taskhub_session";
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

const DEV_DEFAULTS = {
  OWNER_PASSWORD: "dev",
  AGENT_TOKEN: "dev-token",
  SESSION_SECRET: "dev-secret",
} as const;
type Var = keyof typeof DEV_DEFAULTS;

export const isProduction = () => process.env.NODE_ENV === "production";

/** Env var, with the dev default outside production. Throws ConfigError when missing in production. */
export function authEnv(name: Var): string {
  const v = process.env[name];
  if (v) return v;
  if (!isProduction()) return DEV_DEFAULTS[name];
  throw new ConfigError(`${name} is not set. Set ${Object.keys(DEV_DEFAULTS).join(", ")} in the environment.`);
}

/** Names of required auth env vars that are missing (always [] outside production). */
export function missingAuthEnv(): string[] {
  if (!isProduction()) return [];
  return (Object.keys(DEV_DEFAULTS) as Var[]).filter((k) => !process.env[k]);
}

/** Constant-time string comparison (hashes first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function sign(payload: string): string {
  return createHmac("sha256", authEnv("SESSION_SECRET")).update(payload).digest("base64url");
}

/** Cookie value: `<expiry ms>.<hmac>`. */
export function createSessionToken(now = Date.now()): string {
  const exp = String(now + SESSION_MAX_AGE_S * 1000);
  return `${exp}.${sign(exp)}`;
}

export function verifySessionToken(token: string | undefined | null, now = Date.now()): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < now) return false;
  try {
    return safeEqual(mac, sign(exp));
  } catch {
    return false;
  }
}

export function checkOwnerPassword(password: string): boolean {
  return safeEqual(password, authEnv("OWNER_PASSWORD"));
}

/** `Authorization: Bearer <AGENT_TOKEN>` check. */
export function checkAgentToken(authorization: string | null | undefined): boolean {
  if (!authorization) return false;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!m) return false;
  return safeEqual(m[1].trim(), authEnv("AGENT_TOKEN"));
}

export const sessionCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProduction(),
  path: "/",
  maxAge: SESSION_MAX_AGE_S,
});

/** Split comma-separated key lists from headers/args into clean keys. */
export function splitKeys(...values: (string | string[] | null | undefined)[]): string[] {
  return values
    .flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .flatMap((v) => v.split(","))
    .map((k) => k.trim())
    .filter(Boolean);
}

/** Only same-site relative paths survive as a post-login destination. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/board?type=feature";
  return next;
}
