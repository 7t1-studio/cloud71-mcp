# cloud71 MCP connector

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that lets you
**deploy AI‑generated files straight from your AI assistant to live hosting on
[cloud71](https://cloud71.host)** — drop in an HTML page, a PDF, a folder of files, or any
artifact your model just produced, and get back a public `https://*.cloud71.site` URL in
seconds.

It works as a **custom connector in Claude** (Desktop / web) and as a **connector in
ChatGPT**. You sign in with your existing cloud71 account over OAuth — no API keys to copy,
no tokens to paste.

> Hosted at **`https://mcp.cloud71.host`** · runs on Cloudflare Workers · OAuth 2.1 (PKCE +
> Dynamic Client Registration) with cloud71 as the identity provider.

## What it can do

| Tool | What it does |
| --- | --- |
| `deploy_files` | Publish one or more files (any type — HTML/CSS/JS, PDF, images, Office docs, a whole folder) and return the live URL. Name the `site` for a stable URL that later deploys update; optional title, password, email capture, and auto‑expiry. |
| `list_sites` | List your sites: live URL, title, custom domain + SSL state, password / email‑capture flags, expiry, visits this month. |
| `read_site` | Read a site's files and status, so the model can edit‑then‑redeploy. |
| `update_site` | Change a site's settings without redeploying: title, password (or remove it), email capture, expiry, SEO title/description. |
| `manage_domain` | Attach, check, or remove a custom domain; returns the DNS records to add (CNAME + any TXT validation) and whether SSL is live yet. |
| `get_site_stats` | Visits and unique visitors this month vs. the plan limit, recent months, top referrers, captured leads. |
| `list_versions` | List a site's saved versions (number, date, files, size). |
| `rollback_site` | Restore an earlier version; the live version is saved first, so it can be undone. |
| `get_qr_code` | QR code for a site's live URL, as a GIF image plus embeddable SVG markup. |
| `delete_site` | Permanently delete a site (stops serving immediately; annotated destructive). |

Password protection, email capture, SEO settings, and custom domains are paid‑plan
features; when the plan doesn't include one, the tool says so and links to the pricing page.

Every tool acts **only on the signed‑in user's own cloud71 account**, enforced server‑side.

## Add the connector

**Claude** → Settings → Connectors → *Add custom connector* → paste
`https://mcp.cloud71.host/mcp` → *Connect* → sign in to cloud71 and approve.

**ChatGPT** → Settings → Connectors → *Add* → `https://mcp.cloud71.host/mcp` → sign in.

**Claude Code** → `claude mcp add --transport http cloud71 https://mcp.cloud71.host/mcp`,
then `/mcp` to sign in. Or install the plugin below.

## Claude plugin

[`plugin/`](plugin/) is the cloud71 plugin for Claude: the connector entry plus a
`publish-website` skill that teaches Claude the publishing workflow (naming sites,
full-file redeploys, settings, custom domains, rollback, safe deletes). This repo is
also a plugin marketplace, so in Claude Code:

```text
/plugin marketplace add 7t1-studio/cloud71-mcp
/plugin install cloud71@cloud71
```

Then run `/mcp` and sign in to cloud71. Directory submission notes are in
[docs/SUBMISSION.md](docs/SUBMISSION.md).

## How it works

```
Claude / ChatGPT ──OAuth 2.1 (PKCE, DCR)──▶ mcp.cloud71.host  (this MCP server)
                                                  │
                                       upstream login (OAuth/OIDC)
                                                  ▼
                                        app.cloud71.host  (your cloud71 account)
                                                  │
                                       deploys via the cloud71 API
                                                  ▼
                                        *.cloud71.site  (your live site)
```

The MCP server is its own OAuth Authorization Server (so any compliant client can register
dynamically), and it delegates the actual **login** to cloud71. After you approve, the
server holds a per‑grant cloud71 credential (encrypted) and uses it to call the cloud71 API
on your behalf. The server is stateless beyond the OAuth grant store.

## Develop

```bash
pnpm install
cp .dev.vars.example .dev.vars   # fill in the cloud71 OAuth client id/secret
pnpm dev                         # wrangler dev (local, on http://localhost:8788)
pnpm typecheck
pnpm lint
pnpm test                        # vitest: drives every tool through an in-memory MCP client
```

Tools are registered in `src/tools.ts` (`registerTools(server, getClient)`); the cloud71 API
client is `src/cloud71.ts`. Tests in `test/` stub `fetch` and assert the exact API requests.

Connect a local MCP client (e.g. the [MCP Inspector](https://github.com/modelcontextprotocol/inspector))
to `http://localhost:8788/mcp` to exercise the tools.

## Deploy

```bash
pnpm deploy   # wrangler deploy → mcp.cloud71.host
```

## Privacy & security

- [Privacy policy](docs/PRIVACY.md) · [Terms of service](docs/TERMS.md) · [Security](SECURITY.md)
- We store only what's needed to keep you signed in and to deploy on your behalf. We never
  read content you didn't ask us to deploy.

## License

[MIT](LICENSE) © 7t1 Studio
