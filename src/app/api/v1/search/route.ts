import * as svc from "@/server/service";
import type { SearchKind } from "@/lib/types";
import { api, boolParam, intParam, listParam, oneParam } from "../_lib/http";

/** `?q=` every word, any order. Optional `types=task,document,decision`, `space`, `include_archived`, `limit`. */
export const GET = api(async ({ access, query }) =>
  svc.search(access, oneParam(query.q) ?? "", {
    types: listParam(query.types) as SearchKind[] | undefined,
    spaces: listParam(query.spaces),
    includeArchived: boolParam(query.includeArchived),
    limit: intParam(query.limit),
  }),
);
