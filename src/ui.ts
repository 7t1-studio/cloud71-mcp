// Shared branded HTML for the connector's user-facing pages (landing, consent,
// errors). Mirrors the cloud71 marketing site's 7t1 design tokens, fonts, and
// logo so mcp.cloud71.host matches the rest of cloud71.

const STYLES = `
:root{
  --bg:#ffffff;--bg-alt:#f1f0ee;--surface:#ffffff;--surface-2:#f7f6f4;
  --border:#e4e2df;--border-strong:#d8d5d1;
  --text:#161616;--text-2:#686868;--text-3:#9b9893;
  --accent:#9fe870;--accent-hover:#8fe05c;--accent-text:#1f7a3d;
  --accent-subtle:#ecf9e0;--on-accent:#163300;
  --display:"Space Grotesk",ui-sans-serif,system-ui,sans-serif;
  --sans:"Inter",ui-sans-serif,system-ui,sans-serif;
}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
  font-family:var(--sans);color:var(--text);background:var(--bg-alt);
  -webkit-font-smoothing:antialiased}
.card{width:min(440px,100%);background:var(--surface);border:1px solid var(--border);
  border-radius:16px;padding:32px;box-shadow:0 10px 28px -12px rgba(22,51,0,.12)}
.brand{display:flex;align-items:center;gap:10px;font-family:var(--display);
  font-weight:600;font-size:1.125rem;letter-spacing:-.01em;color:var(--text)}
.brand .mark{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;
  background:var(--accent);color:var(--on-accent)}
h1{font-family:var(--display);font-weight:500;font-size:1.4rem;letter-spacing:-.02em;
  margin:22px 0 6px;color:var(--text)}
p{color:var(--text-2);font-size:.95rem;line-height:1.6;margin:0 0 4px}
a{color:var(--accent-text);text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:ui-monospace,"JetBrains Mono",SFMono-Regular,monospace;font-size:.85em;
  background:var(--bg-alt);padding:2px 6px;border-radius:6px}
.scopes{margin:18px 0;padding:16px;border:1px solid var(--border);border-radius:12px;
  background:var(--bg-alt)}
.scopes b{color:var(--text)}
.scopes ul{margin:10px 0 0;padding-left:18px;color:var(--text-2);font-size:.9rem;line-height:1.7}
.row{display:flex;gap:10px;margin-top:24px}
.btn{flex:1;height:44px;display:inline-flex;align-items:center;justify-content:center;
  border-radius:8px;border:1px solid transparent;font:inherit;font-weight:600;font-size:.95rem;
  cursor:pointer;text-decoration:none;transition:background .15s,border-color .15s}
.btn-primary{background:var(--accent);color:var(--on-accent)}
.btn-primary:hover{background:var(--accent-hover);text-decoration:none}
.btn-secondary{background:var(--surface);border-color:var(--border-strong);color:var(--text)}
.btn-secondary:hover{background:var(--surface-2);text-decoration:none}
.muted{color:var(--text-3);font-size:.8rem;margin-top:20px}
`;

/** cloud71 logo mark + wordmark (matches the marketing-site Brand component). */
const LOGO = `<span class="brand"><span class="mark">
<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
<path d="M6 16a4 4 0 0 1 .5-7.97A5 5 0 0 1 16 8.5 3.5 3.5 0 0 1 17 16z"/><path d="M12 11v5m0-5-2 2m2-2 2 2"/>
</svg></span>cloud71</span>`;

/** Wrap page-body HTML in the branded card shell. `body` is trusted/escaped by callers. */
export function page(opts: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${opts.title}</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600&display=swap" rel="stylesheet">
<style>${STYLES}</style></head>
<body><div class="card">${LOGO}${opts.body}</div></body></html>`;
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/** A branded landing page for the bare endpoint root. */
export function landingPage(): string {
  return page({
    title: "cloud71 MCP connector",
    body: `<h1>MCP connector</h1>
<p>This is the cloud71 <strong>Model Context Protocol</strong> endpoint — it lets AI assistants and
agents deploy and manage your sites. There's nothing to use here directly; add it as a connector in
your AI client.</p>
<div class="row">
<a class="btn btn-primary" href="https://cloud71.host/docs/mcp/">Connect guide</a>
<a class="btn btn-secondary" href="https://cloud71.host/ai-agents/">AI agents</a>
</div>
<p class="muted">Endpoint: <code>https://mcp.cloud71.host/mcp</code></p>`,
  });
}

/** A branded message/error page. */
export function messagePage(title: string, message: string, status = 400): Response {
  return htmlResponse(
    page({
      title: `${title} · cloud71`,
      body: `<h1>${title}</h1><p>${message}</p>
<div class="row"><a class="btn btn-secondary" href="https://cloud71.host/docs/mcp/">Back to the connect guide</a></div>`,
    }),
    status,
  );
}
