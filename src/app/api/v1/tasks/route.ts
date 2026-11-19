import * as svc from "@/server/service";
import { api, readBody } from "../_lib/http";

/** List tasks. Every listTasks filter works as a query param (camelCase or snake_case). */
export const GET = api(async ({ access, query }) => svc.listTasks(access, query as Parameters<typeof svc.listTasks>[1]));

/** Create a task (or a draft with `isDraft: true`). */
export const POST = api(
  async ({ req, access }) => svc.createTask(access, (await readBody(req)) as Parameters<typeof svc.createTask>[1]),
  { status: 201 },
);
