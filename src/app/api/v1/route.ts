import { buildCurlGuide, baseUrlFrom } from "@/server/curl-guide";

/**
 * GET /api/v1 — the guide a chat reads first (markdown, no auth, no secrets): credentials, how to make or use
 * a Space, the tracking rules as curl calls, and every endpoint, with this deployment's host filled in.
 */
export async function GET(req: Request): Promise<Response> {
  return new Response(buildCurlGuide(baseUrlFrom(req)), {
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" },
  });
}
