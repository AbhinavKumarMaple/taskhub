import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { Access } from "@/lib/types";
import { Unauthorized } from "./errors";
import { resolveKeys } from "./service/spaces";
import { authEnv, chatActor, checkAgentToken, SESSION_COOKIE, splitKeys, verifySessionToken } from "./session";

export * from "./session";

export const OWNER_ACCESS: Access = { actor: "owner", spaces: "all" };

/** Owner Access from the session cookie, or null. For Server Components / Server Actions. */
export async function getOwnerAccess(): Promise<Access | null> {
  const store = await cookies();
  await connection(); // the expiry check reads the clock: request time only
  return verifySessionToken(store.get(SESSION_COOKIE)?.value) ? OWNER_ACCESS : null;
}

/**
 * Owner Access or redirect to /login. Call it first in every (app) page and every Server Action
 * (the proxy is only an optimistic check).
 */
export async function requireOwner(): Promise<Access> {
  const access = await getOwnerAccess();
  if (!access) redirect("/login");
  return access;
}

function cookieFromHeader(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** `X-Actor` header (trimmed, max 100 chars), default "chat". */
export function actorFromHeaders(headers: Headers, fallback = "chat"): string {
  const a = headers.get("x-actor")?.trim();
  return a ? a.slice(0, 100) : fallback;
}

/**
 * Access for a chat holding these Space keys (unknown or archived Spaces' keys are ignored → no Spaces).
 * The actor name "owner" is reserved for the web app, so a chat asking for it is recorded as "chat:owner".
 */
export async function accessFromKeys(keys: string[], actor = "chat"): Promise<Access> {
  return { actor: chatActor(actor), spaces: await resolveKeys(keys) };
}

/**
 * Agent Access for /api/mcp: requires `Authorization: Bearer <AGENT_TOKEN>`; Space keys come from the
 * `X-Space-Key` header (comma-separated) plus `spaceKeys` (e.g. a tool's `space_key` argument).
 * Throws Unauthorized (401) or ConfigError (500, production without env vars).
 */
export async function getAgentAccess(
  req: Request | Headers,
  opts: { spaceKeys?: string | string[]; actor?: string } = {},
): Promise<Access> {
  const headers = req instanceof Headers ? req : req.headers;
  authEnv("AGENT_TOKEN"); // surfaces ConfigError in production
  if (!checkAgentToken(headers.get("authorization"))) throw new Unauthorized("Missing or invalid agent token");
  const keys = splitKeys(headers.get("x-space-key"), opts.spaceKeys);
  return accessFromKeys(keys, opts.actor ?? actorFromHeaders(headers));
}

/**
 * Access for /api/v1/*: the owner cookie gives `spaces: 'all'` (actor "owner"); otherwise the agent
 * token + Space keys as in getAgentAccess.
 */
export async function getApiAccess(
  req: Request,
  opts: { spaceKeys?: string | string[]; actor?: string } = {},
): Promise<Access> {
  authEnv("SESSION_SECRET");
  const session = cookieFromHeader(req.headers.get("cookie"), SESSION_COOKIE);
  if (verifySessionToken(session)) return OWNER_ACCESS;
  return getAgentAccess(req, opts);
}
