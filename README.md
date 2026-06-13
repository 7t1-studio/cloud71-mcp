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
| `deploy_files` | Publish one or more files (any type — HTML/CSS/JS, PDF, images, Office docs, a whole folder) to a new or existing cloud71 site; returns the live URL. |
| `list_sites` | List your cloud71 sites (name, URL, status). |
| `read_site` | Read a site's files and status, so the model can edit‑then‑redeploy. |
| `manage_site` | Rename a site, attach a custom domain, or delete it (guarded — destructive actions are clearly annotated). |

Every tool acts **only on the signed‑in user's own cloud71 account**, enforced server‑side.

## Add the connector

**Claude** → Settings → Connectors → *Add custom connector* → paste
`https://mcp.cloud71.host` → *Connect* → sign in to cloud71 and approve.

**ChatGPT** → Settings → Connectors → *Add* → `https://mcp.cloud71.host` → sign in.

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
pnpm test
```

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
