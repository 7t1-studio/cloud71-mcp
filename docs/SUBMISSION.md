# Directory submission sheet

Everything needed to submit the cloud71 connector to the **Anthropic (Claude)
connector directory** and the **OpenAI (ChatGPT) connector directory**. Copy the
fields below into each submission form.

The server is **live** at `https://mcp.cloud71.host` (Streamable HTTP, OAuth 2.1).

## Listing fields

| Field | Value |
| --- | --- |
| **Name** | cloud71 |
| **Tagline** | Deploy AI‑generated files to live hosting in seconds. |
| **Category** | Developer tools / Productivity / Hosting |
| **MCP server URL** | `https://mcp.cloud71.host` |
| **Auth** | OAuth 2.1 (PKCE S256 + Dynamic Client Registration); login via cloud71 account |
| **Website** | https://cloud71.host |
| **Documentation** | https://github.com/7t1-studio/cloud71-mcp |
| **Privacy policy** | https://github.com/7t1-studio/cloud71-mcp/blob/main/docs/PRIVACY.md |
| **Terms of service** | https://github.com/7t1-studio/cloud71-mcp/blob/main/docs/TERMS.md |
| **Support contact** | hello@cloud71.host |
| **Icon** | `assets/icon.svg` (export to 512×512 PNG if the form requires raster) |

### Short description (≤ ~100 chars)

> Publish HTML pages, PDFs, images, or whole folders to a live cloud71.site URL — straight from chat.

### Long description

> cloud71 turns whatever your assistant just generated into a real, live website.
> Hand it an HTML page, a PDF, an image, an Office document, or an entire folder,
> and it publishes to a public `https://*.cloud71.site` URL in seconds — with free
> SSL, analytics, and optional custom domains. You sign in with your own cloud71
> account over OAuth (no API keys to paste), and every action runs only against
> your account. List your sites, read a site's files to edit‑then‑redeploy, attach
> a custom domain, or take a site down — all from the conversation.

## Tools (with safety annotations)

| Tool | Title | readOnly | destructive | Purpose |
| --- | --- | --- | --- | --- |
| `deploy_files` | Deploy files to cloud71 | no | no | Publish one or more files (any type) to a new/existing site; returns the live URL. |
| `list_sites` | List my cloud71 sites | yes | no | List the user's sites (name, URL, status). |
| `read_site` | Read a cloud71 site | yes | no | List a site's files, or return one file's text. |
| `manage_site` | Manage a cloud71 site | no | yes | Rename, attach a custom domain, or delete a site. |

## Example prompts (≥ 3 required)

1. **"Build me a one‑page coming‑soon site for 'Northwind Coffee' and deploy it to cloud71."**
   → the model generates `index.html` and calls `deploy_files`, returning a live URL.
2. **"Take this PDF report and host it on cloud71 so I can share a link."**
   → `deploy_files` with a single PDF; returns `https://<name>.cloud71.site`.
3. **"List my cloud71 sites and tell me which one was updated most recently."**
   → `list_sites`.
4. **"Read the index.html of my `northwind` site, change the headline to 'Now Open', and redeploy it."**
   → `read_site` → edit → `deploy_files` with `site: "northwind"`.
5. **"Attach the domain www.northwind.coffee to my `northwind` site."**
   → `manage_site` with `action: "set_domain"` (returns the DNS records to add).

## Test account (required by both directories)

Create a dedicated reviewer account so the directory team can exercise the flow:

1. Sign up at https://app.cloud71.host (free plan, no card).
2. Provide those credentials in the submission's "test account" field.
3. Reviewer flow: add `https://mcp.cloud71.host` as a custom connector → sign in →
   approve → run example prompt #1.

## Acceptance checklist (Anthropic)

- [x] Streamable HTTP transport at `/mcp`
- [x] `.well-known/oauth-authorization-server` (RFC 8414)
- [x] `.well-known/oauth-protected-resource` (RFC 9728)
- [x] OAuth 2.1, PKCE **S256**, implicit flow disabled, plain PKCE disabled
- [x] Dynamic Client Registration (RFC 7591) at `/register`
- [x] Every tool has `title`, `readOnlyHint`, `destructiveHint` annotations
- [x] Tool names ≤ 64 chars, descriptive
- [x] Privacy policy + terms + support contact published
- [x] Server deployed at a stable HTTPS URL
- [ ] Test account created and added to the submission (your step)
- [ ] Submit the listing in the Claude / ChatGPT connector forms (your step)

## Verify the live server

```bash
# OAuth metadata
curl https://mcp.cloud71.host/.well-known/oauth-authorization-server
curl https://mcp.cloud71.host/.well-known/oauth-protected-resource

# /mcp returns 401 + WWW-Authenticate pointing at the resource metadata
curl -i -X POST https://mcp.cloud71.host/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Or point the [MCP Inspector](https://github.com/modelcontextprotocol/inspector)
at `https://mcp.cloud71.host/mcp` and complete the OAuth sign‑in to list + call tools.
