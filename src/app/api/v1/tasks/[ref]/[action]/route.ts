import * as svc from "@/server/service";
import { NotFound } from "@/server/errors";
import { api, readBody } from "../../../_lib/http";

type P = { ref: string; action: string };

const ACTIONS = {
  archive: svc.archiveTask,
  restore: svc.restoreTask,
  promote: svc.promoteDraft,
  demote: svc.demoteTask,
} as const;

/** POST /tasks/{ref}/archive|restore|promote|demote|comments */
export const POST = api<P>(async ({ req, access, params }) => {
  if (params.action === "comments") {
    const body = await readBody(req);
    return Response.json(await svc.addComment(access, params.ref, { body: String(body.body ?? "") }), {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  }
  const fn = ACTIONS[params.action as keyof typeof ACTIONS];
  if (!fn) throw new NotFound(`Unknown action "${params.action}"`);
  return fn(access, params.ref);
});

/** GET /tasks/{ref}/comments | /tasks/{ref}/history (the status trail, oldest first) */
export const GET = api<P>(async ({ access, params }) => {
  if (params.action === "comments") return (await svc.getTask(access, params.ref)).comments;
  if (params.action === "history") return (await svc.getTask(access, params.ref)).statusHistory;
  throw new NotFound(`Unknown action "${params.action}"`);
});
