import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import type { Env } from "./types.ts";
import { htmlResponse, landingPage, messagePage } from "./ui.ts";
import { exchangeCode, upstreamAuthorizeUrl } from "./utils.ts";
import {
  clientIdAlreadyApproved,
  parseRedirectApproval,
  renderApprovalDialog,
} from "./workers-oauth-utils.ts";

const app = new Hono<{ Bindings: Env }>();

const SCOPE = "deploy sites:read sites:write";

// Branded landing for the bare endpoint root (otherwise a 404).
app.get("/", () => htmlResponse(landingPage()));

/** Redirect the user to cloud71 to log in, round-tripping the OAuth request in `state`. */
function redirectToCloud71(env: Env, requestUrl: string, oauthReqInfo: AuthRequest): Response {
  const url = upstreamAuthorizeUrl({
    baseUrl: env.CLOUD71_BASE_URL,
    clientId: env.CLOUD71_CLIENT_ID,
    redirectUri: new URL("/callback", requestUrl).href,
    state: btoa(JSON.stringify(oauthReqInfo)),
    scope: SCOPE,
  });
  return new Response(null, { status: 302, headers: { location: url } });
}

// Step 1: the MCP client sends the user here to authorize.
app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  if (!oauthReqInfo.clientId)
    return messagePage(
      "Invalid request",
      "This authorization request is missing required parameters. Start the connection again from your AI client.",
      400,
    );

  // Skip the consent screen if this client was already approved on this device.
  if (
    await clientIdAlreadyApproved(c.req.raw, oauthReqInfo.clientId, c.env.COOKIE_ENCRYPTION_KEY)
  ) {
    return redirectToCloud71(c.env, c.req.url, oauthReqInfo);
  }

  const client = await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
  return renderApprovalDialog(c.req.raw, {
    client: { clientId: oauthReqInfo.clientId, clientName: client?.clientName },
    server: {
      name: "cloud71",
      description: "Deploy AI-generated files to live hosting on cloud71.",
    },
    state: oauthReqInfo as unknown as Record<string, unknown>,
  });
});

// Step 2: the user approved the consent screen → record it and go to cloud71.
app.post("/authorize", async (c) => {
  const { state, setCookie } = await parseRedirectApproval(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
  const res = redirectToCloud71(c.env, c.req.url, state as unknown as AuthRequest);
  res.headers.append("set-cookie", setCookie);
  return res;
});

// Step 3: cloud71 redirects back after login → exchange the code, finish the grant.
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  if (!code || !stateParam)
    return messagePage(
      "Sign-in incomplete",
      "The login response was missing required values.",
      400,
    );

  let oauthReqInfo: AuthRequest;
  try {
    oauthReqInfo = JSON.parse(atob(stateParam)) as AuthRequest;
  } catch {
    return messagePage("Sign-in incomplete", "The login response could not be verified.", 400);
  }
  if (!oauthReqInfo.clientId)
    return messagePage("Sign-in incomplete", "The login response could not be verified.", 400);

  let user: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    user = await exchangeCode({
      baseUrl: c.env.CLOUD71_BASE_URL,
      clientId: c.env.CLOUD71_CLIENT_ID,
      clientSecret: c.env.CLOUD71_CLIENT_SECRET,
      code,
      redirectUri: new URL("/callback", c.req.url).href,
    });
  } catch (err) {
    console.error("MCP callback exchange failed:", err);
    return messagePage(
      "Sign-in failed",
      "We couldn't complete sign-in with cloud71. Please try connecting again.",
      400,
    );
  }

  const subject = user.userId || user.email;
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: subject,
    metadata: { label: user.email },
    scope: oauthReqInfo.scope,
    props: { userId: subject, email: user.email, cloud71Token: user.accessToken },
  });
  return new Response(null, { status: 302, headers: { location: redirectTo } });
});

export default app;
