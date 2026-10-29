import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import qrcode from "qrcode-generator";
import { z } from "zod";
import type {
  ApiDate,
  Cloud71Client,
  DnsValidationRecord,
  SiteSettings,
  SiteSettingsPatch,
  SiteSummary,
} from "./cloud71.ts";

export const SERVER_INFO = { name: "cloud71", version: "1.1.0" } as const;

export const SERVER_INSTRUCTIONS = [
  "cloud71 turns files into live websites at https://<site>.cloud71.site.",
  "- Give deploy_files a `site` name (e.g. 'northwind') for a stable URL; redeploying with the same name updates that site in place. Without it, every deploy creates a new site with a random name.",
  "- Password protection, email (lead) capture, SEO settings and custom domains are paid-plan features. An error mentioning a paid plan / upgrade (HTTP 402) means the user must upgrade — pass the pricing link on and don't retry.",
  "- Every republish keeps the previous version. rollback_site restores one and is itself reversible (the live version is saved first).",
  "- delete_site is permanent and cannot be undone — only call it when the user explicitly asks to delete that site.",
].join("\n");

const HOURS_MS = 3_600_000;

const siteParam = z
  .string()
  .min(1)
  .describe("The site's name (subdomain), e.g. 'northwind' for northwind.cloud71.site.");

/** Registers every cloud71 tool on `server`; `getClient` returns the signed-in user's client. */
export function registerTools(server: McpServer, getClient: () => Cloud71Client): void {
  server.registerTool(
    "deploy_files",
    {
      title: "Deploy files to cloud71",
      description:
        "Publish files to live hosting on cloud71 and get the public URL (live in seconds). " +
        "Accepts any content: an HTML page, PDF, image, Office document, or a whole website " +
        "(several files with relative paths like 'index.html', 'css/app.css'). " +
        "Name the site with `site` (e.g. 'northwind' → https://northwind.cloud71.site) for a " +
        "stable URL: later deploys with the same `site` update it in place, and the previous " +
        "version is kept for rollback_site. Omit `site` to create a new site with a random name. " +
        "Optional: `title`; `password` and `lead_capture` (email capture) need the Starter plan " +
        "or higher; `expires_in_hours` deletes the site automatically after that long.",
      inputSchema: {
        files: z
          .array(
            z.object({
              path: z.string().describe("Relative path, e.g. 'index.html' or 'assets/app.js'."),
              content: z.string().describe("File contents (UTF-8 text, or base64)."),
              encoding: z
                .enum(["utf8", "base64"])
                .optional()
                .describe("Set 'base64' for binary files (PDF, images, fonts)."),
            }),
          )
          .min(1)
          .describe("The files to publish."),
        site: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Subdomain to create or update, e.g. 'northwind'. Reuse it on later deploys to keep " +
              "the same URL. Omit to create a new site with a random name.",
          ),
        title: z.string().min(1).optional().describe("Display title for the site."),
        password: z
          .string()
          .min(1)
          .optional()
          .describe("Require this password to view the site (Starter plan or higher)."),
        lead_capture: z
          .boolean()
          .optional()
          .describe(
            "Show an opt-in email form in the corner of the site; visitors can dismiss it " +
              "(Starter plan or higher).",
          ),
        expires_in_hours: z
          .number()
          .positive()
          .optional()
          .describe("Delete the site automatically after this many hours (e.g. 72)."),
      },
      annotations: {
        title: "Deploy files to cloud71",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ files, site, title, password, lead_capture, expires_in_hours }) => {
      const result = await getClient().deploy(files, {
        site,
        title,
        password,
        leadCapture: lead_capture,
        ttlSeconds: expires_in_hours === undefined ? undefined : expires_in_hours * 3600,
      });
      const lines = [
        `Published ${plural(files.length, "file")} to ${result.url} (site "${result.subdomain}"). It goes live within a few seconds.`,
      ];
      const extras: string[] = [];
      if (password !== undefined) extras.push("Password protected.");
      if (lead_capture !== undefined) extras.push(`Email capture ${lead_capture ? "on" : "off"}.`);
      if (expires_in_hours !== undefined) {
        extras.push(`Expires ${fmtDate(Date.now() + expires_in_hours * HOURS_MS)}.`);
      }
      if (extras.length) lines.push(extras.join(" "));
      if (result.warning) lines.push(result.warning);
      lines.push(
        `To update this same URL later, call deploy_files again with site: "${result.subdomain}".`,
      );
      return text(lines.join("\n"));
    },
  );

  server.registerTool(
    "list_sites",
    {
      title: "List my cloud71 sites",
      description:
        "List the sites in the user's cloud71 account: name (subdomain), title, live URL, " +
        "custom domain and SSL state, password / email-capture flags, expiry, and visits this month.",
      inputSchema: {},
      annotations: {
        title: "List my cloud71 sites",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      const { sites } = await getClient().listSites();
      if (!sites.length) {
        return text("You don't have any sites yet. Use deploy_files to publish your first one.");
      }
      return text([`${plural(sites.length, "site")}:`, ...sites.map(formatSiteSummary)].join("\n"));
    },
  );

  server.registerTool(
    "read_site",
    {
      title: "Read a cloud71 site",
      description:
        "Read a site's files and status so you can edit then redeploy. Without `path`, lists " +
        "the site's files; with `path`, returns that file's text contents.",
      inputSchema: {
        site: siteParam,
        path: z.string().optional().describe("A file path to read; omit to list files."),
      },
      annotations: {
        title: "Read a cloud71 site",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ site, path }) => {
      const data = await getClient().readSite(site, path);
      return text(JSON.stringify(data, null, 2));
    },
  );

  server.registerTool(
    "update_site",
    {
      title: "Update a cloud71 site's settings",
      description:
        "Change a site's settings without redeploying its files: title, visitor password " +
        "(null removes it), email capture, expiry (hours from now; null = never expire — an " +
        "expired site is deleted), and SEO title/description (null clears). Pass only what " +
        "should change. Password, email capture and SEO need a paid plan.",
      inputSchema: {
        site: siteParam,
        title: z.string().min(1).optional().describe("New display title."),
        password: z
          .string()
          .min(1)
          .nullable()
          .optional()
          .describe("New visitor password, or null to remove password protection."),
        lead_capture: z
          .boolean()
          .optional()
          .describe("Turn the opt-in email form (a dismissible corner box) on or off."),
        expires_in_hours: z
          .number()
          .positive()
          .nullable()
          .optional()
          .describe("Delete the site this many hours from now, or null to never expire."),
        seo_title: z
          .string()
          .nullable()
          .optional()
          .describe("Search/social title (<title> override), or null to clear."),
        seo_description: z
          .string()
          .nullable()
          .optional()
          .describe("Search/social meta description, or null to clear."),
      },
      annotations: {
        title: "Update a cloud71 site's settings",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      site,
      title,
      password,
      lead_capture,
      expires_in_hours,
      seo_title,
      seo_description,
    }) => {
      const patch: SiteSettingsPatch = {};
      if (title !== undefined) patch.title = title;
      if (password !== undefined) patch.password = password;
      if (lead_capture !== undefined) patch.leadCapture = lead_capture;
      if (expires_in_hours !== undefined) {
        patch.expiresAt =
          expires_in_hours === null ? null : Math.round(Date.now() + expires_in_hours * HOURS_MS);
      }
      if (seo_title !== undefined) patch.seoTitle = seo_title;
      if (seo_description !== undefined) patch.seoDescription = seo_description;
      if (Object.keys(patch).length === 0) {
        throw new Error(
          "Nothing to update — pass at least one of title, password, lead_capture, " +
            "expires_in_hours, seo_title or seo_description.",
        );
      }
      const result = await getClient().updateSettings(site, patch);
      return text(
        `Updated ${result.site || site}. Current settings:\n${formatSettings(result.settings)}`,
      );
    },
  );

  server.registerTool(
    "manage_domain",
    {
      title: "Manage a site's custom domain",
      description:
        "Attach, check, or remove a custom domain (e.g. www.example.com) on a site. 'add' " +
        "returns the DNS records the user must create (a CNAME to the site plus any TXT " +
        "validation record); SSL is issued automatically once DNS resolves. 'status' reports " +
        "whether the domain is live yet. 'remove' detaches it (the cloud71.site URL keeps " +
        "working). Custom domains depend on the user's cloud71 plan.",
      inputSchema: {
        site: siteParam,
        action: z
          .enum(["add", "status", "remove"])
          .describe("'add' a domain, check its 'status', or 'remove' it."),
        domain: z
          .string()
          .optional()
          .describe("The domain to attach, e.g. 'www.example.com' (required for 'add')."),
      },
      annotations: {
        title: "Manage a site's custom domain",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ site, action, domain }) => {
      const client = getClient();
      if (action === "add") {
        const host = normalizeDomain(domain ?? "");
        if (!host) throw new Error("`domain` is required for action 'add' (e.g. www.example.com).");
        const r = await client.setDomain(site, host);
        const attached = r.domain || host;
        const sslReady = r.sslStatus === "active";
        return text(
          [
            `Attaching ${attached} to ${r.site || site}. ${sslReady ? "SSL is already active — it goes live as soon as the CNAME below resolves." : "It isn't live yet."}`,
            "",
            dnsInstructions(attached, r.cnameTarget, r.dnsRecords),
            "",
            sslReady
              ? `Status: ${sslPhrase(r.sslStatus)}. Confirm with manage_domain action "status".`
              : `Status: ${sslPhrase(r.sslStatus)}. SSL activates automatically once DNS resolves (usually minutes, sometimes a few hours). Check progress with manage_domain action "status".`,
          ].join("\n"),
        );
      }
      if (action === "status") {
        const r = await client.domainStatus(site);
        const name = r.site || site;
        if (!r.domain) {
          return text(
            `${name} has no custom domain attached; it's served at https://${r.cnameTarget || `${name}.cloud71.site`}. Attach one with manage_domain action "add".`,
          );
        }
        if (r.ready) {
          return text(
            `${r.domain} is live on ${name} (${sslPhrase(r.sslStatus)}). Keep the DNS record in place: CNAME ${r.domain} → ${r.cnameTarget}.`,
          );
        }
        return text(
          [
            `${r.domain} is attached to ${name} but not live yet (${sslPhrase(r.sslStatus)}).`,
            "",
            dnsInstructions(r.domain, r.cnameTarget, r.dnsRecords),
            "",
            "Once these records resolve, SSL is issued automatically — check again in a few minutes.",
          ].join("\n"),
        );
      }
      const r = await client.removeDomain(site);
      const name = r.site || site;
      return text(
        r.removed
          ? `Removed ${r.removed} from ${name}. The site is still live at https://${name}.cloud71.site, and the DNS records for ${r.removed} can now be deleted.`
          : `${name} had no custom domain attached — nothing to remove.`,
      );
    },
  );

  server.registerTool(
    "get_site_stats",
    {
      title: "Get a cloud71 site's stats",
      description:
        "Get a site's traffic: visits and unique visitors this month against the plan's monthly " +
        "visit limit, recent months, top referrers, and how many email leads it has captured.",
      inputSchema: { site: siteParam },
      annotations: {
        title: "Get a cloud71 site's stats",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ site }) => {
      const s = await getClient().siteStats(site);
      const lines = [`Stats for ${s.site || site} (${s.url})`];
      const used = s.thisMonth.visits;
      if (s.visitLimit) {
        const pct = Math.round((used / s.visitLimit) * 100);
        lines.push(
          `This month: ${fmtNum(used)} visits (${fmtNum(s.thisMonth.uniqueVisitors)} unique) of ${fmtNum(s.visitLimit)} allowed by the plan (${pct}%).`,
        );
      } else {
        lines.push(
          `This month: ${fmtNum(used)} visits (${fmtNum(s.thisMonth.uniqueVisitors)} unique); no monthly visit limit.`,
        );
      }
      const months = [...s.months].sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));
      if (months.length) {
        lines.push("", "By month:");
        for (const m of months.slice(0, 6)) {
          lines.push(
            `• ${m.yearMonth}: ${fmtNum(m.visits)} visits, ${fmtNum(m.uniqueVisitors)} unique, ${fmtBytes(m.bandwidthBytes)} served`,
          );
        }
      }
      lines.push("", "Top referrers:");
      if (s.topReferrers.length) {
        for (const r of s.topReferrers) {
          lines.push(`• ${r.referrer || "(direct / none)"}: ${fmtNum(r.visits)}`);
        }
      } else {
        lines.push("• none recorded yet");
      }
      lines.push(
        "",
        `Email leads: ${fmtNum(s.leads.total)} total, ${fmtNum(s.leads.last30Days)} in the last 30 days.`,
      );
      return text(lines.join("\n"));
    },
  );

  server.registerTool(
    "list_versions",
    {
      title: "List a cloud71 site's versions",
      description:
        "List a site's saved versions (version number, date, file count, size). cloud71 keeps " +
        "a snapshot each time a site is republished; restore one with rollback_site.",
      inputSchema: { site: siteParam },
      annotations: {
        title: "List a cloud71 site's versions",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ site }) => {
      const { site: name, versions } = await getClient().listVersions(site);
      if (!versions.length) {
        return text(
          `${name || site} has no saved versions yet — they're kept each time it's republished.`,
        );
      }
      const sorted = [...versions].sort((a, b) => b.version - a.version);
      return text(
        [
          `${name || site} has ${plural(versions.length, "saved version")} (newest first):`,
          ...sorted.map(
            (v) =>
              `• v${v.version} — ${fmtDate(v.createdAt) ?? "date unknown"} — ${plural(v.fileCount, "file")}, ${fmtBytes(v.bytes)}${v.sourceType ? ` (${v.sourceType})` : ""}`,
          ),
          "Restore one with rollback_site.",
        ].join("\n"),
      );
    },
  );

  server.registerTool(
    "rollback_site",
    {
      title: "Roll back a cloud71 site",
      description:
        "Restore a site to an earlier saved version (see list_versions). The current live " +
        "version is saved as a version first, so a rollback can itself be undone.",
      inputSchema: {
        site: siteParam,
        version: z.number().int().positive().describe("The version number to restore."),
      },
      annotations: {
        title: "Roll back a cloud71 site",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ site, version }) => {
      const r = await getClient().rollback(site, version);
      return text(
        `Rolled ${r.site || site} back to version ${r.version ?? version} (${fmtBytes(r.bytes)}). The previous live version was saved first — undo with rollback_site (see list_versions).`,
      );
    },
  );

  server.registerTool(
    "get_qr_code",
    {
      title: "Get a QR code for a cloud71 site",
      description:
        "Generate a QR code for a site's live URL (its custom domain when one is active). " +
        "Returns the QR as a GIF image plus SVG markup you can embed in a page or flyer.",
      inputSchema: { site: siteParam },
      annotations: {
        title: "Get a QR code for a cloud71 site",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ site }) => {
      const { sites } = await getClient().listSites();
      const wanted = site.trim().toLowerCase();
      const found = sites.find((s) => s.subdomain.toLowerCase() === wanted);
      if (!found) {
        throw new Error(
          `No site named "${site}" in this cloud71 account. Use list_sites to see the site names.`,
        );
      }
      const liveUrl = found.liveUrl || found.url;
      // QR byte mode encodes Latin-1 only; normalise IDN hosts/paths to ASCII.
      const target = /^[\x20-\x7e]*$/.test(liveUrl) ? liveUrl : new URL(liveUrl).href;
      const qr = qrcode(0, "M");
      qr.addData(target);
      qr.make();
      const gif = qr.createDataURL(10, 40).replace(/^data:image\/gif;base64,/, "");
      const svg = qr.createSvgTag({ cellSize: 8, margin: 32, scalable: true });
      return {
        content: [
          { type: "image", data: gif, mimeType: "image/gif" },
          {
            type: "text",
            text: `QR code for ${target} (site "${found.subdomain}").\n\nSVG markup (scalable — give it a width when embedding it):\n${svg}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "delete_site",
    {
      title: "Delete a cloud71 site (permanent)",
      description:
        "PERMANENTLY delete a site: it stops serving immediately at its cloud71.site URL and any " +
        "custom domain, and it can't be restored with these tools. Only call this when the user " +
        "has explicitly asked to delete this specific site.",
      inputSchema: { site: siteParam },
      annotations: {
        title: "Delete a cloud71 site (permanent)",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ site }) => {
      const r = await getClient().deleteSite(site);
      return text(
        `Deleted ${r.site || site}. It no longer serves at its cloud71.site URL or any custom domain, and can't be restored from here.`,
      );
    },
  );
}

// --- formatting helpers -------------------------------------------------------

function text(s: string): CallToolResult {
  return { content: [{ type: "text", text: s }] };
}

function plural(n: number, noun: string): string {
  return `${fmtNum(n)} ${noun}${n === 1 ? "" : "s"}`;
}

function fmtNum(n: number | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
}

function fmtBytes(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 1024) {
    return `${Math.max(0, Math.round(n ?? 0) || 0)} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

/** Format an API date (ISO string, ms or s epoch) as "YYYY-MM-DD HH:MM UTC". */
function fmtDate(v: ApiDate | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : /^\d+$/.test(v) ? Number(v) : Number.NaN;
  const d = Number.isNaN(n) ? new Date(v) : new Date(n < 1e11 ? n * 1000 : n);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function sslPhrase(status: string | null | undefined): string {
  if (!status) return "SSL status unknown";
  if (status === "active") return "SSL active";
  return `SSL ${status.replace(/_/g, " ")}`;
}

function formatSiteSummary(s: SiteSummary): string {
  const live = s.liveUrl || s.url;
  const head = `• ${s.subdomain}${s.title ? ` — "${s.title}"` : ""} — ${live}`;
  const facts: string[] = [];
  if (s.status && s.status !== "active") facts.push(`status: ${s.status}`);
  if (s.url && s.url !== live) facts.push(`also at ${s.url}`);
  if (s.customDomain) facts.push(`custom domain ${s.customDomain} (${sslPhrase(s.sslStatus)})`);
  if (s.isProtected) facts.push("password protected");
  if (s.leadCaptureEnabled) facts.push("email capture on");
  const expires = fmtDate(s.expiresAt);
  if (expires) facts.push(`expires ${expires}`);
  if (typeof s.visitsThisMonth === "number") {
    facts.push(`${plural(s.visitsThisMonth, "visit")} this month`);
  }
  const updated = fmtDate(s.updatedAt);
  if (updated) facts.push(`updated ${updated}`);
  if (s.tags?.length) facts.push(`tags: ${s.tags.join(", ")}`);
  return facts.length ? `${head}\n  ${facts.join(" · ")}` : head;
}

function formatSettings(s: SiteSettings): string {
  const orUnset = (v: string | null) => (v ? v : "(not set)");
  return [
    `• Title: ${orUnset(s.title)}`,
    `• Password protection: ${s.isProtected ? "on" : "off"}`,
    `• Email capture: ${s.leadCaptureEnabled ? "on" : "off"}`,
    `• Expires: ${fmtDate(s.expiresAt) ?? "never"}`,
    `• SEO title: ${orUnset(s.seoTitle)}`,
    `• SEO description: ${orUnset(s.seoDescription)}`,
  ].join("\n");
}

/** Strip a scheme/path the model may have included: "https://www.x.com/" → "www.x.com". */
function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
}

/** Human-readable DNS setup steps for a custom domain. */
function dnsInstructions(domain: string, cnameTarget: string, records: DnsValidationRecord[]) {
  const lines = ["Add these DNS records at the domain's DNS provider:"];
  let n = 1;
  lines.push(`  ${n++}. CNAME  ${domain}  →  ${cnameTarget}`);
  const txt = (records ?? []).filter((r) => r.txtName && r.txtValue);
  for (const r of txt) {
    lines.push(`  ${n++}. TXT    ${r.txtName}  =  "${r.txtValue}"   (SSL certificate validation)`);
  }
  if (!txt.length && (records ?? []).some((r) => r.httpUrl)) {
    lines.push(
      "  No TXT record needed — the certificate validates over HTTP once the CNAME works.",
    );
  }
  if (domain.split(".").length === 2) {
    lines.push(
      `Note: ${domain} is a root domain. Many DNS providers don't allow a CNAME there — use an ALIAS/ANAME or "CNAME flattening" record pointing at ${cnameTarget}, or use www.${domain} instead.`,
    );
  }
  return lines.join("\n");
}
