import * as svc from "@/server/service";
import { api, listParam } from "../_lib/http";

export const GET = api(async ({ access, query }) => svc.statistics(access, { spaces: listParam(query.spaces) }));
