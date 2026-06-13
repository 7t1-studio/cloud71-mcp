import OAuthProvider from "@cloudflare/workers-oauth-provider";
import authHandler from "./auth-handler.ts";
import { Cloud71MCP } from "./mcp.ts";

// The Durable Object class must be exported for the binding in wrangler.jsonc.
export { Cloud71MCP };

/**
 * The connector is an OAuth 2.1 Authorization Server (to Claude / ChatGPT) that
 * delegates user login upstream to cloud71. `workers-oauth-provider` handles the
 * MCP-side OAuth (PKCE, Dynamic Client Registration, token storage); `authHandler`
 * runs the upstream login + consent.
 */
export default new OAuthProvider({
  apiHandlers: {
    "/mcp": Cloud71MCP.serve("/mcp") as never,
    "/sse": Cloud71MCP.serveSSE("/sse") as never,
  },
  // biome-ignore lint/suspicious/noExplicitAny: Hono app satisfies the handler interface.
  defaultHandler: authHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  allowImplicitFlow: false,
  // OAuth 2.1 strictness: require S256 PKCE, no plain.
  allowPlainPKCE: false,
  scopesSupported: ["deploy", "sites:read", "sites:write"],
});
