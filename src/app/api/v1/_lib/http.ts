/**
 * Shared plumbing for the REST API (/api/v1/*): auth, JSON in/out, query parsing, errors.
 * Every route is a thin call into the service layer.
 */
import type { Access } from "@/lib/types";
import { getApiAccess } from "@/server/auth";
import { unstable_rethrow } from "next/navigation";
import { errorResponse, Invalid } from "@/server/errors";

export type ApiContext<P> = {
  req: Request;
  url: URL;
  access: Access;
  params: P;
  /** Query string as an object (camelCased keys; repeated keys become arrays). */
  query: Record<string, string | string[]>;
};

type RouteCtx<P> = { params: Promise<P> };

const NO_STORE = { "cache-control": "no-store" };

/** snake_case → camelCase (top-level keys only), so `acceptance_criteria` works like `acceptanceCriteria`. */
export function camelKey(k: string): string {
  return k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function camelize(obj: unknown): Record<string, unknown> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[camelKey(k)] = v;
  return out;
}

const RESERVED_QUERY = new Set(["space_key", "spaceKey"]);

/** Aliases accepted in query strings, mapped to service input names. */
const QUERY_ALIASES: Record<string, string> = { space: "spaces", label: "labels" };

export function queryObject(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [rawKey, value] of url.searchParams) {
    if (RESERVED_QUERY.has(rawKey)) continue;
    const camel = camelKey(rawKey);
    const key = QUERY_ALIASES[camel] ?? camel;
    const prev = out[key];
    out[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  }
  return out;
}

/** Comma/array query value → string[] (undefined when absent). */
export function listParam(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  const parts = (Array.isArray(v) ? v : [v]).flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

export function boolParam(v: string | string[] | undefined): boolean | undefined {
  const s = oneParam(v);
  return s === undefined ? undefined : s === "true" || s === "1";
}

export function intParam(v: string | string[] | undefined): number | undefined {
  const s = oneParam(v);
  if (s === undefined || s === "") return undefined;
  const n = Number(s);
  if (!Number.isInteger(n)) throw new Invalid(`Expected an integer, got "${s}"`);
  return n;
}

export function oneParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[v.length - 1] : v;
}

/** JSON body as a camelCased object. Empty body → {}. Bad JSON → 400. */
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text.trim()) return {};
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Invalid("Body must be valid JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Invalid("Body must be a JSON object");
  return camelize(data);
}

/**
 * Wraps a route: resolves Access (owner cookie, or Bearer AGENT_TOKEN + X-Space-Key / `space_key`),
 * runs `fn`, and returns its result as JSON (or the Response it returns). Errors → `{error:{code,message}}`.
 */
export function api<P = Record<string, never>>(
  fn: (c: ApiContext<P>) => Promise<unknown>,
  opts: { status?: number } = {},
) {
  return async (req: Request, ctx?: RouteCtx<P>): Promise<Response> => {
    try {
      const url = new URL(req.url);
      const access = await getApiAccess(req, { spaceKeys: url.searchParams.get("space_key") ?? undefined });
      const params = ctx ? await ctx.params : ({} as P);
      const out = await fn({ req, url, access, params, query: queryObject(url) });
      if (out instanceof Response) return out;
      return Response.json(out, { status: opts.status ?? 200, headers: NO_STORE });
    } catch (err) {
      unstable_rethrow(err); // let Next see its own prerender/dynamic signals
      return errorResponse(err);
    }
  };
}

export function textResponse(text: string, contentType = "text/plain; charset=utf-8"): Response {
  return new Response(text, { headers: { "content-type": contentType, ...NO_STORE } });
}
