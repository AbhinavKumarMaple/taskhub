/**
 * The MCP endpoint (/api/mcp, Streamable HTTP via mcp-handler; stateless).
 * Auth: `Authorization: Bearer <AGENT_TOKEN>` is checked before any MCP traffic (401 otherwise).
 * Each tool then resolves its Spaces from the `X-Space-Key` header plus its `space_key` argument.
 */
import { createMcpHandler } from "mcp-handler";
import { getAgentAccess } from "@/server/auth";
import { errorResponse, Unauthorized } from "@/server/errors";
import { TRACKING_RULES } from "@/server/instructions";
import { authEnv, checkAgentToken } from "@/server/session";
import { registerTools } from "./tools";

export const MCP_SERVER_INFO = { name: "taskhub", version: "0.1.0" };

export async function handleMcpRequest(req: Request): Promise<Response> {
  try {
    authEnv("AGENT_TOKEN"); // ConfigError (500) in production without it
    if (!checkAgentToken(req.headers.get("authorization"))) throw new Unauthorized("Missing or invalid agent token");
  } catch (err) {
    return errorResponse(err);
  }
  const handler = createMcpHandler(
    (server) => {
      registerTools(server, (spaceKey, actor) => getAgentAccess(req.headers, { spaceKeys: spaceKey, actor }));
    },
    { serverInfo: MCP_SERVER_INFO, instructions: TRACKING_RULES },
  );
  return handler(req);
}
