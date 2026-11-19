import * as svc from "@/server/service";
import { api, textResponse } from "../_lib/http";

/** The board as markdown. Takes the same filters as GET /tasks. */
export const GET = api(async ({ access, query }) =>
  textResponse(
    await svc.exportBoardMarkdown(access, query as Parameters<typeof svc.exportBoardMarkdown>[1]),
    "text/markdown; charset=utf-8",
  ),
);
