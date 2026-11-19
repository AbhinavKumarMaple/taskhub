import * as svc from "@/server/service";
import { api, boolParam, readBody } from "../_lib/http";

/** The Spaces the caller's keys open (owner: all), with task counts and keys. */
export const GET = api(async ({ access, query }) =>
  svc.listSpaces(access, { includeArchived: boolParam(query.includeArchived) }),
);

/** Create a Space. The response includes its `key`: pass it as X-Space-Key / space_key from now on. */
export const POST = api(
  async ({ req, access }) => svc.createSpace(access, (await readBody(req)) as Parameters<typeof svc.createSpace>[1]),
  { status: 201 },
);
