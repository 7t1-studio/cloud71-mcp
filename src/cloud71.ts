import { zipSync } from "fflate";

export interface DeployFile {
  /** Relative path, e.g. "index.html" or "css/app.css". */
  path: string;
  /** File contents — UTF-8 text, or base64 (set `encoding: "base64"`) for binary. */
  content: string;
  encoding?: "utf8" | "base64";
}

export interface DeployResult {
  ok: boolean;
  siteId: string;
  subdomain: string;
  url: string;
}

export interface SiteSummary {
  subdomain: string;
  url: string;
  status: string;
  updatedAt: string;
}

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
  async deploy(files: DeployFile[], opts: { site?: string } = {}): Promise<DeployResult> {
    if (files.length === 0) throw new Error("No files to deploy.");
    const toBytes = (f: DeployFile) =>
      f.encoding === "base64" ? base64ToBytes(f.content) : new TextEncoder().encode(f.content);

    let body: Uint8Array;
    let filename: string;
    const [only] = files;
    if (files.length === 1 && only && !only.path.includes("/")) {
      // A single loose file (e.g. report.pdf, index.html) deploys as-is.
      body = toBytes(only);
      filename = only.path;
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
    if (opts.site) headers["x-c71-site"] = opts.site;

    return this.json<DeployResult>(
      await fetch(`${this.baseUrl}/api/cli/deploy`, { method: "POST", headers, body }),
    );
  }

  async listSites(): Promise<{ sites: SiteSummary[] }> {
    return this.json(await fetch(`${this.baseUrl}/api/cli/sites`, { headers: this.auth() }));
  }

  /** Without `path`: list the site's files. With `path`: return that file's text. */
  async readSite(site: string, path?: string): Promise<unknown> {
    const u = new URL(`${this.baseUrl}/api/cli/read`);
    u.searchParams.set("site", site);
    if (path) u.searchParams.set("path", path);
    return this.json(await fetch(u, { headers: this.auth() }));
  }

  async manageSite(body: Record<string, unknown>): Promise<unknown> {
    return this.json(
      await fetch(`${this.baseUrl}/api/cli/manage`, {
        method: "POST",
        headers: { ...this.auth(), "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  private async json<T = unknown>(res: Response): Promise<T> {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : `cloud71 API error ${res.status}`,
      );
    }
    return data as T;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
