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

/** POST /tasks/{ref}/archive|restore|promote|demote|comments|deploy|rollback */
export const POST = api<P>(async ({ req, access, params }) => {
  if (params.action === "comments") {
    const body = await readBody(req);
    return Response.json(await svc.addComment(access, params.ref, { body: String(body.body ?? "") }), {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  }
  if (params.action === "deploy") {
    // {"environment":"Production","version":"…","url":"…","note":"…","include_children":false}
    const body = await readBody(req);
    await svc.recordDeployment(access, { ...body, refs: [params.ref] } as Parameters<typeof svc.recordDeployment>[1]);
    return svc.getTask(access, params.ref);
  }
  if (params.action === "rollback") {
    // {"environment":"Production","note":"why"}
    const body = await readBody(req);
    return svc.rollbackDeployment(access, params.ref, body as Parameters<typeof svc.rollbackDeployment>[2]);
  }
  const fn = ACTIONS[params.action as keyof typeof ACTIONS];
  if (!fn) throw new NotFound(`Unknown action "${params.action}"`);
  return fn(access, params.ref);
});

/** GET /tasks/{ref}/comments | history (status trail) | deployments (current deploys + deploy history) */
export const GET = api<P>(async ({ access, params }) => {
  if (params.action === "comments") return (await svc.getTask(access, params.ref)).comments;
  if (params.action === "history") return (await svc.getTask(access, params.ref)).statusHistory;
  if (params.action === "deployments") {
    const t = await svc.getTask(access, params.ref);
    return { deployable: t.deployable, current: t.deployments, history: t.deployHistory };
  }
  throw new NotFound(`Unknown action "${params.action}"`);
});
