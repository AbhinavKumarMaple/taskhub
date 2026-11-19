import * as svc from "@/server/service";
import { api, readBody } from "../../_lib/http";

type P = { ref: string };

/** Full task: checklists, children, dependencies both ways, comments, activity. */
export const GET = api<P>(async ({ access, params }) => svc.getTask(access, params.ref));

/** Update any field and/or apply list ops (addAc, checkAc, appendNotes, addLabels, addDeps, …). */
export const PATCH = api<P>(async ({ req, access, params }) =>
  svc.updateTask(access, params.ref, (await readBody(req)) as Parameters<typeof svc.updateTask>[2]),
);

/** Delete forever. Only archived tasks without children. */
export const DELETE = api<P>(async ({ access, params }) => svc.deleteTask(access, params.ref));
