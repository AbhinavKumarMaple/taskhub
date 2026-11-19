/** Call App Router route handlers directly with Request objects. */
import { createSessionToken, SESSION_COOKIE } from "@/server/session";

export const TOKEN = "dev-token";

type Handler = (req: Request, ctx?: { params: Promise<never> }) => Promise<Response>;

export type CallOpts = {
  key?: string | string[];
  body?: unknown;
  token?: string | null;
  actor?: string;
  owner?: boolean;
  query?: Record<string, string>;
  params?: Record<string, string>;
};

export function makeRequest(method: string, path: string, opts: CallOpts = {}): Request {
  const url = new URL(`http://localhost/api/v1${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const headers = new Headers();
  if (opts.owner) headers.set("cookie", `${SESSION_COOKIE}=${createSessionToken()}`);
  else if (opts.token !== null) headers.set("authorization", `Bearer ${opts.token ?? TOKEN}`);
  if (opts.key) headers.set("x-space-key", Array.isArray(opts.key) ? opts.key.join(",") : opts.key);
  if (opts.actor) headers.set("x-actor", opts.actor);
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  return new Request(url, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function call(handler: unknown, method: string, path: string, opts: CallOpts = {}): Promise<{ status: number; body: any }> {
  const res = await (handler as Handler)(
    makeRequest(method, path, opts),
    opts.params ? { params: Promise.resolve(opts.params as never) } : undefined,
  );
  const type = res.headers.get("content-type") ?? "";
  const body = type.includes("json") ? await res.json() : await res.text();
  return { status: res.status, body };
}
