import * as svc from "@/server/service";
import { api, readBody } from "../_lib/http";

/** GET /deployments?environment=Production&limit=50 — recent deploys and roll-backs, newest first. */
export const GET = api(async ({ access, query }) =>
  svc.listDeployments(access, query as Parameters<typeof svc.listDeployments>[1]),
);

/**
 * POST /deployments — one deploy that shipped several tasks:
 * {"environment":"Production","refs":["T-12","T-14.2"],"version":"8e3d7d1","url":"https://…","note":"…","include_children":true}
 */
export const POST = api(
  async ({ req, access }) =>
    svc.recordDeployment(access, (await readBody(req)) as Parameters<typeof svc.recordDeployment>[1]),
  { status: 201 },
);
