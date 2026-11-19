import * as svc from "@/server/service";
import { api, readBody } from "../../_lib/http";

/** Put tasks in exactly this order: `{ refs: [...], status? }`. */
export const POST = api(async ({ req, access }) =>
  svc.reorderTasks(access, (await readBody(req)) as Parameters<typeof svc.reorderTasks>[1]),
);
