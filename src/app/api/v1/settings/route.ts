import * as svc from "@/server/service";
import { api, readBody } from "../_lib/http";

/** Statuses (board columns, last = done), types, priorities, labels, DoD defaults. */
export const GET = api(async ({ access }) => svc.getSettings(access));

/** Owner only (chats get 403). */
export const PATCH = api(async ({ req, access }) =>
  svc.updateSettings(access, (await readBody(req)) as Parameters<typeof svc.updateSettings>[1]),
);
