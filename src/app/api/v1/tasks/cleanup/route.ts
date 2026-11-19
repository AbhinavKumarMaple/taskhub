import * as svc from "@/server/service";
import { api, readBody } from "../../_lib/http";

/** Archive Done tasks older than N days: `{ olderThanDays, spaces? }`. */
export const POST = api(async ({ req, access }) =>
  svc.cleanupDone(access, (await readBody(req)) as Parameters<typeof svc.cleanupDone>[1]),
);
