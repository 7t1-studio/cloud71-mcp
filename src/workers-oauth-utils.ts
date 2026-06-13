// Signed-cookie "approved clients" + the consent dialog shown before the user is
// sent upstream to log in. Adapted from the Cloudflare workers-oauth-provider
// reference (HMAC-SHA256 over the approved client-id list).

const COOKIE_NAME = "__c71_mcp_approved";
const ONE_YEAR = 60 * 60 * 24 * 365;

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(secret: string, data: string): Promise<string> {
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(data),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function verify(secret: string, data: string, sig: string): Promise<boolean> {
  const expected = await sign(secret, data);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function readApprovedList(request: Request, secret: string): Promise<string[]> {
  const raw = parseCookies(request.headers.get("cookie"))[COOKIE_NAME];
  if (!raw) return [];
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !(await verify(secret, payload, sig))) return [];
  try {
    const list = JSON.parse(atob(payload));
    return Array.isArray(list) ? (list as string[]) : [];
  } catch {
    return [];
  }
}

/** Has this OAuth client already been approved (signed cookie) on this device? */
export async function clientIdAlreadyApproved(
  request: Request,
  clientId: string,
  secret: string,
): Promise<boolean> {
  return (await readApprovedList(request, secret)).includes(clientId);
}

async function approvedCookieHeader(
  request: Request,
  clientId: string,
  secret: string,
): Promise<string> {
  const list = await readApprovedList(request, secret);
  if (!list.includes(clientId)) list.push(clientId);
  const payload = btoa(JSON.stringify(list));
  const value = `${payload}.${await sign(secret, payload)}`;
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ONE_YEAR}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ApprovalDialogOptions {
  client: { clientId: string; clientName?: string } | null;
  server: { name: string; description?: string };
  state: Record<string, unknown>;
}

/** Render the consent screen. The form POSTs back with the encoded OAuth request. */
export function renderApprovalDialog(_request: Request, opts: ApprovalDialogOptions): Response {
  const encodedState = btoa(JSON.stringify(opts.state));
  const clientName = escapeHtml(
    opts.client?.clientName || opts.client?.clientId || "An MCP client",
  );
  const serverName = escapeHtml(opts.server.name);
  const desc = escapeHtml(opts.server.description ?? "");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize ${serverName}</title>
<style>
  :root{color-scheme:light dark}
  body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0}
  .card{width:min(420px,92vw);background:#111827;border:1px solid #1f2937;border-radius:16px;padding:28px;box-shadow:0 10px 40px rgba(0,0,0,.4)}
  h1{font-size:1.25rem;margin:0 0 4px}
  p{color:#94a3b8;font-size:.95rem;line-height:1.5}
  .who{margin:18px 0;padding:14px;border:1px solid #1f2937;border-radius:10px;background:#0b1220}
  .who b{color:#e2e8f0}
  ul{margin:8px 0 0;padding-left:1.1rem;color:#94a3b8;font-size:.9rem}
  .row{display:flex;gap:10px;margin-top:22px}
  button{flex:1;height:42px;border-radius:10px;border:0;font:inherit;font-weight:600;cursor:pointer}
  .approve{background:#34d399;color:#06281c}
  .cancel{background:#1f2937;color:#e2e8f0}
  .brand{font-weight:700;color:#34d399}
</style></head>
<body><div class="card">
  <div class="brand">cloud71</div>
  <h1>Connect to ${serverName}</h1>
  <p>${desc}</p>
  <div class="who"><b>${clientName}</b> is requesting access to your cloud71 account. After you approve, you'll sign in to cloud71.
    <ul>
      <li>Deploy files to your hosting</li>
      <li>List and read your sites</li>
      <li>Manage your sites (rename, custom domain, delete)</li>
    </ul>
  </div>
  <form method="post">
    <input type="hidden" name="state" value="${encodedState}">
    <div class="row">
      <button class="cancel" type="button" onclick="history.back()">Cancel</button>
      <button class="approve" type="submit">Approve &amp; sign in</button>
    </div>
  </form>
</div></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

/** Parse the approval POST, returning the OAuth request + a Set-Cookie that records approval. */
export async function parseRedirectApproval(
  request: Request,
  secret: string,
): Promise<{ state: Record<string, unknown>; setCookie: string }> {
  const form = await request.formData();
  const encoded = form.get("state");
  if (typeof encoded !== "string") throw new Error("Missing approval state");
  const state = JSON.parse(atob(encoded)) as Record<string, unknown>;
  const clientId = typeof state.clientId === "string" ? state.clientId : "";
  return { state, setCookie: await approvedCookieHeader(request, clientId, secret) };
}
