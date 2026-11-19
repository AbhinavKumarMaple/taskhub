import * as svc from "@/server/service";
import { api, intParam, oneParam } from "../_lib/http";

/** Newest first. `?space=&entity_ref=&actor=&limit=&before=` (before = `nextBefore` from the previous page). */
export const GET = api(async ({ access, query }) =>
  svc.listActivity(access, {
    spaceId: oneParam(query.spaces) ?? oneParam(query.spaceId),
    entityRef: oneParam(query.entityRef) ?? oneParam(query.ref),
    actor: oneParam(query.actor),
    limit: intParam(query.limit),
    before: intParam(query.before),
  }),
);
