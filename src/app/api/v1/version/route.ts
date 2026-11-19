import * as svc from "@/server/service";
import { api, listParam } from "../_lib/http";

/**
 * Cheap change marker for board polling: `{ version }` changes whenever anything visible to the
 * caller (in `?space=`, if given) is written. Poll it; refetch only when it changes.
 */
export const GET = api(async ({ access, query }) => ({
  version: await svc.getVersion(access, { spaces: listParam(query.spaces) }),
}));
