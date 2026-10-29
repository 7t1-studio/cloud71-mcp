import { zipSync } from "fflate";

export interface DeployFile {
  /** Relative path, e.g. "index.html" or "css/app.css". */
  path: string;
  /** File contents — UTF-8 text, or base64 (set `encoding: "base64"`) for binary. */
  content: string;
  encoding?: "utf8" | "base64";
}

export interface DeployOptions {
  /** Subdomain to update, or to create with this name. Omit for a random new site. */
  site?: string;
  /** Display title. */
  title?: string;
  /** Visitor password (paid plans). */
  password?: string;
  /** Opt-in email form (a dismissible corner box) on the site (paid plans). */
  leadCapture?: boolean;
  /** Auto-expire this many seconds from now. */
  ttlSeconds?: number;
}

export interface DeployResult {
  ok: boolean;
  siteId: string;
  subdomain: string;
  url: string;
  subdomainUrl?: string;
  pathUrl?: string | null;
  /** Set by the client when a follow-up step (e.g. applying a non-ASCII title) failed. */
  warning?: string;
}

/** A date as the API serialises it: ISO string or epoch number. */
export type ApiDate = string | number | null;

export interface SiteSummary {
  subdomain: string;
  url: string;
  status: string;
  updatedAt?: ApiDate;
  title?: string | null;
  tags?: string[];
  expiresAt?: ApiDate;
  // The fields below are newer additions to /api/cli/sites; optional so the
  // connector still formats sensibly against an older API deployment.
  customDomain?: string | null;
  sslStatus?: string | null;
  liveUrl?: string;
  isProtected?: boolean;
  leadCaptureEnabled?: boolean;
  visitsThisMonth?: number;
}

export interface SiteSettingsPatch {
  title?: string;
  /** New visitor password, or `null` to remove protection. */
  password?: string | null;
  leadCapture?: boolean;
  /** ms epoch when the site expires, or `null` for never. */
  expiresAt?: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export interface SiteSettings {
  title: string | null;
  isProtected: boolean;
  leadCaptureEnabled: boolean;
  expiresAt: ApiDate;
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface SettingsResult {
  ok: boolean;
  site: string;
  settings: SiteSettings;
}

/** A Cloudflare for SaaS certificate-validation record (TXT or HTTP). */
export interface DnsValidationRecord {
  txtName?: string;
  txtValue?: string;
  httpUrl?: string;
  httpBody?: string;
}

export interface SetDomainResult {
  ok: boolean;
  site: string;
  domain: string;
  sslStatus: string | null;
  cnameTarget: string;
  dnsRecords: DnsValidationRecord[];
  note?: string;
}

export interface DomainStatusResult {
  ok: boolean;
  site: string;
  domain: string | null;
  sslStatus: string | null;
  ready: boolean;
  cnameTarget: string;
  dnsRecords: DnsValidationRecord[];
}

export interface RemoveDomainResult {
  ok: boolean;
  site: string;
  removed: string | null;
}

export interface RollbackResult {
  ok: boolean;
  site: string;
  version: number;
  bytes: number;
}

export interface DeleteResult {
  ok: boolean;
  site: string;
  deleted?: boolean;
}

export interface SiteStats {
  site: string;
  url: string;
  months: { yearMonth: string; visits: number; uniqueVisitors: number; bandwidthBytes: number }[];
  thisMonth: { visits: number; uniqueVisitors: number };
  visitLimit: number | null;
  topReferrers: { referrer: string; visits: number }[];
  leads: { total: number; last30Days: number };
}

export interface SiteVersion {
  version: number;
  fileCount: number;
  bytes: number;
  createdAt: ApiDate;
  sourceType: string;
}

export interface VersionsResult {
  site: string;
  versions: SiteVersion[];
}

/** An error response from the cloud71 API, with a user/LLM-readable message. */
export class Cloud71ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "Cloud71ApiError";
    this.status = status;
  }
}

export const REAUTH_MESSAGE =
  "Your cloud71 sign-in expired or was revoked — reconnect the cloud71 connector.";

/** Thin client for the cloud71 hosting API, authenticated with the user's token. */
export class Cloud71Client {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private auth(): Record<string, string> {
    return { authorization: `Bearer ${this.token}` };
  }

  /** Publish files to a new or existing site; returns the live URL. */
  async deploy(files: DeployFile[], opts: DeployOptions = {}): Promise<DeployResult> {
    if (files.length === 0) throw new Error("No files to deploy.");
    const toBytes = (f: DeployFile) =>
      f.encoding === "base64" ? base64ToBytes(f.content) : new TextEncoder().encode(f.content);

    let body: Uint8Array;
    let filename: string;
    const [only] = files;
    if (files.length === 1 && only && !only.path.includes("/")) {
      // A single loose file (e.g. report.pdf, index.html) deploys as-is.
      body = toBytes(only);
      filename = asciiFilename(only.path);
    } else {
      // Multiple files / a folder → one zip through the unpack pipeline.
      const entries: Record<string, Uint8Array> = {};
      for (const f of files) entries[f.path] = toBytes(f);
      body = zipSync(entries);
      filename = "site.zip";
    }

    const headers: Record<string, string> = {
      ...this.auth(),
      "content-type": "application/octet-stream",
      "x-c71-filename": filename,
    };
    if (opts.site) {
      if (!isHeaderSafe(opts.site)) {
        throw new Error(
          "Site names are subdomains — use lowercase letters, digits and hyphens (e.g. 'northwind').",
        );
      }
      headers["x-c71-site"] = opts.site;
    }
    // HTTP headers only carry plain ASCII safely; a title with other characters
    // (emoji, accents, CJK…) is applied through the JSON settings call instead.
    const titleViaSettings = opts.title !== undefined && !isHeaderSafe(opts.title);
    if (opts.title !== undefined && !titleViaSettings) headers["x-c71-title"] = opts.title;
    if (opts.password !== undefined) {
      if (!isHeaderSafe(opts.password)) {
        throw new Error(
          "A password set while deploying must use plain ASCII letters, digits and symbols. " +
            "Pick a different password, or set this one afterwards with update_site.",
        );
      }
      headers["x-c71-password"] = opts.password;
    }
    if (opts.leadCapture !== undefined) headers["x-c71-lead-capture"] = String(opts.leadCapture);
    if (opts.ttlSeconds !== undefined) {
      headers["x-c71-ttl"] = String(Math.max(1, Math.round(opts.ttlSeconds)));
    }

    const result = await this.json<DeployResult>(
      await fetch(`${this.baseUrl}/api/cli/deploy`, { method: "POST", headers, body }),
    );

    if (titleViaSettings && opts.title !== undefined) {
      try {
        await this.updateSettings(result.subdomain, { title: opts.title });
      } catch (err) {
        result.warning = `The site was published, but its title couldn't be set: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    }
    return result;
  }

  async listSites(): Promise<{ sites: SiteSummary[] }> {
    return this.json(await fetch(`${this.baseUrl}/api/cli/sites`, { headers: this.auth() }));
  }

  /** Without `path`: list the site's files. With `path`: return that file's text. */
  async readSite(site: string, path?: string): Promise<unknown> {
    return this.get("/api/cli/read", { site, path });
  }

  async siteStats(site: string): Promise<SiteStats> {
    return this.get("/api/cli/stats", { site });
  }

  async listVersions(site: string): Promise<VersionsResult> {
    return this.get("/api/cli/versions", { site });
  }

  async updateSettings(site: string, settings: SiteSettingsPatch): Promise<SettingsResult> {
    return this.manage(site, "settings", { ...settings });
  }

  async setDomain(site: string, domain: string): Promise<SetDomainResult> {
    return this.manage(site, "set_domain", { domain });
  }

  async domainStatus(site: string): Promise<DomainStatusResult> {
    return this.manage(site, "domain_status");
  }

  async removeDomain(site: string): Promise<RemoveDomainResult> {
    return this.manage(site, "remove_domain");
  }

  async rollback(site: string, version: number): Promise<RollbackResult> {
    return this.manage(site, "rollback", { version });
  }

  async deleteSite(site: string): Promise<DeleteResult> {
    return this.manage(site, "delete");
  }

  private async get<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
    const u = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
    return this.json<T>(await fetch(u, { headers: this.auth() }));
  }

  private async manage<T>(
    site: string,
    action: string,
    extra: Record<string, unknown> = {},
  ): Promise<T> {
    return this.json<T>(
      await fetch(`${this.baseUrl}/api/cli/manage`, {
        method: "POST",
        headers: { ...this.auth(), "content-type": "application/json" },
        body: JSON.stringify({ site, action, ...extra }),
      }),
    );
  }

  private async json<T = unknown>(res: Response): Promise<T> {
    const text = await res.text().catch(() => "");
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // Non-JSON body (e.g. a plain-text 401); fall through to the status mapping.
    }
    if (!res.ok) throw new Cloud71ApiError(this.errorMessage(res.status, data), res.status);
    return data as T;
  }

  private errorMessage(status: number, data: Record<string, unknown>): string {
    const apiMessage = typeof data.error === "string" && data.error.trim() ? data.error.trim() : "";
    if (status === 401) return REAUTH_MESSAGE;
    if (status === 402) {
      const base = apiMessage || "This needs a paid cloud71 plan.";
      return `${withPeriod(base)} Upgrade the cloud71 plan to use it: ${this.baseUrl}/pricing`;
    }
    return apiMessage || `cloud71 API error (HTTP ${status}).`;
  }
}

/** Printable ASCII only — the only header-value range every runtime round-trips intact. */
function isHeaderSafe(value: string): boolean {
  return /^[\x20-\x7e]*$/.test(value);
}

/** Make a filename header-safe while keeping its extension (accents folded, rest → "_"). */
function asciiFilename(name: string): string {
  if (isHeaderSafe(name)) return name;
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x20-\x7e]/g, "_");
}

function withPeriod(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
