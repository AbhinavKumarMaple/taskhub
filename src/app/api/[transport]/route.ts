import { NotFound, errorResponse } from "@/server/errors";
import { handleMcpRequest } from "@/server/mcp/handler";

type Ctx = { params: Promise<{ transport: string }> };

async function handle(req: Request, ctx: Ctx): Promise<Response> {
  const { transport } = await ctx.params;
  if (transport !== "mcp") return errorResponse(new NotFound());
  return handleMcpRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
