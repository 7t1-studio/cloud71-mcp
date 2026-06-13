# Security

## Reporting a vulnerability

Please report security issues privately to **security@cloud71.host** (or open a private
advisory on this repo). We aim to acknowledge within 3 business days. Do not file public
issues for vulnerabilities.

## Security model

- **OAuth 2.1.** The connector is an OAuth Authorization Server implementing Authorization
  Code + **PKCE** and **Dynamic Client Registration** (RFC 7591). It publishes
  `.well-known/oauth-authorization-server` and `.well-known/oauth-protected-resource`
  (RFC 9728) metadata. There are no static client secrets shared with end‑user clients.
- **Login is delegated to cloud71.** The connector never sees your cloud71 password; the
  user authenticates upstream against `app.cloud71.host` and approves a consent screen.
- **Least privilege & tenant isolation.** Every tool call is authorized with the
  signed‑in user's own cloud71 credential and is scoped server‑side to that user's
  account. The connector cannot act on another user's resources.
- **Tokens at rest.** Per‑grant tokens are stored encrypted (Cloudflare Workers KV via the
  OAuth provider) and are revoked/deleted on disconnect.
- **Transport.** All endpoints are HTTPS only; the MCP transport is Streamable HTTP.
- **No standing content access.** The server only handles the files passed to a deploy call;
  it does not read conversation content or browse your account beyond the requested action.

## Scope

This policy covers the `cloud71-mcp` connector server. Hosting‑side issues belong to the
cloud71 platform; report those to the same address.
