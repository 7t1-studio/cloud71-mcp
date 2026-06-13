import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

/**
 * Worker bindings. The vars + DO/KV bindings (MCP_OBJECT, OAUTH_KV,
 * CLOUD71_BASE_URL) come from the wrangler-generated `Cloudflare.Env`
 * (worker-configuration.d.ts) so the McpAgent generic constraint is satisfied;
 * here we add the runtime-injected provider plus the secrets, which don't appear
 * in generated types.
 */
export type Env = Cloudflare.Env & {
  /** Injected by the OAuthProvider into the default (auth) handler. */
  OAUTH_PROVIDER: OAuthHelpers;
  /** OAuth client this connector is registered as on cloud71. */
  CLOUD71_CLIENT_ID: string;
  CLOUD71_CLIENT_SECRET: string;
  /** Secret used to sign the "already approved this client" cookie. */
  COOKIE_ENCRYPTION_KEY: string;
};

/**
 * Per-grant auth context. It is end-to-end encrypted inside the OAuth token and
 * surfaces as `this.props` in every tool handler. Holds the cloud71 API token we
 * obtained for the signed-in user.
 */
export interface Props extends Record<string, unknown> {
  userId: string;
  email: string;
  cloud71Token: string;
}
