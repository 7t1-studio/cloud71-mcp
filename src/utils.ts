/** Build the cloud71 (upstream) authorize URL the user is redirected to for login. */
export function upstreamAuthorizeUrl(p: {
  baseUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const u = new URL(`${p.baseUrl}/api/oauth/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("state", p.state);
  if (p.scope) u.searchParams.set("scope", p.scope);
  return u.href;
}

export interface UpstreamUser {
  accessToken: string;
  userId: string;
  email: string;
}

/** Exchange a cloud71 authorization code for an access token + the user identity. */
export async function exchangeCode(p: {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<UpstreamUser> {
  const res = await fetch(`${p.baseUrl}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: p.code,
      client_id: p.clientId,
      client_secret: p.clientSecret,
      redirect_uri: p.redirectUri,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    user?: { id?: string; email?: string };
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description ?? data.error ?? `Token exchange failed (${res.status})`,
    );
  }
  return {
    accessToken: data.access_token,
    userId: data.user?.id ?? "",
    email: data.user?.email ?? "",
  };
}
