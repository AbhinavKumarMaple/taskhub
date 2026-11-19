import { getInstructions } from "@/server/instructions";
import { api, textResponse } from "../_lib/http";

/** The tracking rules for chats, as markdown. */
export const GET = api(async () => textResponse(getInstructions(), "text/markdown; charset=utf-8"));
