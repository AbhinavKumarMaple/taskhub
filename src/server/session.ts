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

/** Minimum lengths enforced in production, so a weak secret cannot be deployed by accident. */
export const MIN_LENGTH: Record<Var, number> = { OWNER_PASSWORD: 12, AGENT_TOKEN: 32, SESSION_SECRET: 32 };

/**
 * Env var, with the dev default outside production. Throws ConfigError when missing (or shorter than
 * MIN_LENGTH) in production.
 */
export function authEnv(name: Var): string {
  const v = process.env[name];
  if (!isProduction()) return v || DEV_DEFAULTS[name];
  if (!v) throw new ConfigError(`${name} is not set. Set ${Object.keys(DEV_DEFAULTS).join(", ")} in the environment.`);
  if (v.length < MIN_LENGTH[name])
    throw new ConfigError(`${name} is too short: use at least ${MIN_LENGTH[name]} characters.`);
  return v;
}

/** Required auth env vars that are missing or too short (always [] outside production). */
export function missingAuthEnv(): string[] {
  if (!isProduction()) return [];
  return (Object.keys(DEV_DEFAULTS) as Var[])
    .filter((k) => (process.env[k]?.length ?? 0) < MIN_LENGTH[k])
    .map((k) => (process.env[k] ? `${k} (at least ${MIN_LENGTH[k]} characters)` : k));
}

/** Constant-time string comparison (hashes first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * The HMAC covers the expiry and a hash of OWNER_PASSWORD, so changing the password signs every
 * existing session out (as does rotating SESSION_SECRET).
 */
function sign(payload: string): string {
  const pw = createHash("sha256").update(authEnv("OWNER_PASSWORD")).digest("base64url");
  return createHmac("sha256", authEnv("SESSION_SECRET")).update(`${payload}.${pw}`).digest("base64url");
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

const DEFAULT_NEXT = "/board?type=feature";

/**
 * Only same-origin relative paths survive as a post-login destination. Control characters, spaces and
 * backslashes are refused outright (browsers strip tabs/newlines, so "/\t/evil.example" would become
 * "//evil.example"); the rest is parsed and must stay on the same origin.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || /[\x00-\x20\x7f\\]/.test(next)) return DEFAULT_NEXT;
  try {
    const u = new URL(next, "http://taskhub.invalid");
    if (u.origin !== "http://taskhub.invalid") return DEFAULT_NEXT;
    return u.pathname + u.search + u.hash;
  } catch {
    return DEFAULT_NEXT;
  }
}

/** Reserved actor names a chat may not record itself as. */
export function chatActor(name: string | null | undefined): string {
  const a = (name ?? "").trim().slice(0, 100);
  if (!a) return "chat";
  return /^owner$/i.test(a) ? `chat:${a}` : a;
}
