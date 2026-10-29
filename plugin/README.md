# cloud71 for Claude

Turn anything Claude makes into a live website. With the cloud71 plugin, Claude can publish an HTML page, a multi-page or built static site, a report, a PDF, or images to a shareable `https://<name>.cloud71.site` link in seconds. After that it can update the site in place, add a visitor password or an expiry, show an opt-in email form, set SEO text, put the site on your own domain, tell you how many people opened it, roll back to an earlier version, make a QR code, or take the site down. It works in Claude chat, Cowork, and Claude Code.

This plugin is one skill that teaches Claude the publishing workflow, plus a connector entry for cloud71's hosted MCP server.

## What you need

- A cloud71 account. The free plan includes one site on a cloud71.site address with SSL and visit analytics. Visitor passwords, the email form, SEO text, and custom domains need a paid plan.

## Use it

1. Add the plugin from the Claude directory (**Customize > Plugins** on claude.ai, or `/plugin` in Claude Code).
2. Connect the **cloud71** connector. On claude.ai and in Cowork, open the plugin's **Connectors** tab and select **Connect**. In Claude Code, run `/mcp`, choose `cloud71`, and sign in. You sign in to cloud71 in your browser with OAuth; you never paste a token into Claude.
3. Ask Claude for what you want. Tools that change your sites are marked as such, so Claude asks for your approval before it runs them unless you chose to allow them in advance.

Example prompts:

- "Make a one-page site for our spring bake sale with the date, the menu, and a map link, then publish it to cloud71 as bake-sale and give me the link."
- "Publish this report as q3-report, protected with a password I'll give you, and make the link expire in 7 days."
- "Use reports.acme.com for my q3-report site and tell me which DNS records to add. Later: is it live yet?"
- "How many people opened my pitch site this month, and where did they come from?"
- "Change the headline on my portfolio site to 'Product designer in Lisbon' and republish it. If it looks wrong, roll it back."
- "Give me a QR code for my menu site that I can print."

## What it can do

The connector has ten tools:

| Tool | What it does |
|------|--------------|
| `deploy_files` | Publish one file or a whole site, new or in place, with an optional title, visitor password, email form, and expiry |
| `list_sites` | List your sites with their links, custom domains, protection, and visits this month |
| `read_site` | Read a site's files back so Claude can edit and republish |
| `update_site` | Change the title, visitor password, email form, expiry, or SEO text |
| `manage_domain` | Attach a custom domain and get its DNS records, check SSL, or remove it |
| `get_site_stats` | Visits and unique visitors by month, top referrers, and lead counts |
| `list_versions` | List a site's saved versions (the last 5 republishes) |
| `rollback_site` | Restore a saved version; the current one is saved first |
| `get_qr_code` | A QR code for a site, as an image and as SVG |
| `delete_site` | Take a site down permanently |

cloud71 hosts static files. It does not run server code such as PHP, a Node or Python server, or a database. Click heatmaps, team seats, white-label, redirects, and lead exports are managed in the cloud71 dashboard.

## What runs and where your data goes

- **The connector** sends Claude's tool calls over HTTPS to cloud71's MCP server at `https://mcp.cloud71.host/mcp`, which forwards them to the cloud71 app at `https://app.cloud71.host` as your signed-in user. Each call carries only what Claude passes to the tool: the files it publishes, the site name, and the settings you asked for.
- **Published sites are public** to anyone with the link, unless you protect them with a visitor password. cloud71 stores the files you publish and its last 5 versions of each site, counts visits, and keeps the emails your visitors choose to submit through the email form.
- The plugin itself stores nothing and contains no secrets. It reads no Claude conversation history, memory, or files beyond what you ask Claude to publish. Sign-in uses OAuth 2.1 with PKCE, and you can revoke access at any time by removing the connector or deleting its token in your cloud71 dashboard.

## Privacy policy

cloud71's privacy policy is at [cloud71.host/privacy](https://cloud71.host/privacy/). It covers what data cloud71 collects, who it is shared with, how long it is kept, your rights, and how to contact us.

## Support

- Documentation: [cloud71.host/docs/mcp](https://cloud71.host/docs/mcp/)
- Support: hello@cloud71.host
- Terms: [cloud71.host/terms](https://cloud71.host/terms/)

## Files

| Path | Purpose |
|------|---------|
| `.claude-plugin/plugin.json` | Plugin manifest and directory listing fields |
| `.mcp.json` | Connector entry for the hosted MCP server |
| `skills/publish-website/` | The publishing skill |
| `assets/` | Plugin icon |

## License

MIT. See [LICENSE](LICENSE). Copyright © 2026 7t1 Studio.
