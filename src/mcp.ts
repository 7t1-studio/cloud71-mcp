import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { Cloud71Client } from "./cloud71.ts";
import { SERVER_INFO, SERVER_INSTRUCTIONS, registerTools } from "./tools.ts";
import type { Env, Props } from "./types.ts";

/**
 * The cloud71 MCP server. One Durable Object instance per MCP session; `this.props`
 * carries the signed-in user's cloud71 token (set during OAuth), and every tool
 * acts only on that user's account. The tools themselves live in tools.ts so they
 * can be exercised without the Durable Object.
 */
export class Cloud71MCP extends McpAgent<Env, unknown, Props> {
  server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });

  private client(): Cloud71Client {
    const token = this.props?.cloud71Token;
    if (!token) throw new Error("Not authenticated with cloud71. Please reconnect the connector.");
    return new Cloud71Client(this.env.CLOUD71_BASE_URL, token);
  }

  async init() {
    registerTools(this.server, () => this.client());
  }
}
