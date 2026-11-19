import * as svc from "@/server/service";
import { api, readBody } from "../../_lib/http";

export const GET = api<{ id: string }>(async ({ access, params }) => svc.getSpace(access, params.id));

/** Rename / recolour / describe a Space the caller holds. */
export const PATCH = api<{ id: string }>(async ({ req, access, params }) =>
  svc.updateSpace(access, params.id, (await readBody(req)) as Parameters<typeof svc.updateSpace>[2]),
);
