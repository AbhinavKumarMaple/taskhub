import * as svc from "@/server/service";
import { api, readBody } from "../../_lib/http";

/** Move a task: `{ ref, status?, beforeRef?, afterRef?, ordinal? }`. */
export const POST = api(async ({ req, access }) =>
  svc.moveTask(access, (await readBody(req)) as Parameters<typeof svc.moveTask>[1]),
);
