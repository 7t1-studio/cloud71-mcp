import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cloud71Client, REAUTH_MESSAGE } from "../src/cloud71.ts";
import { SERVER_INFO, SERVER_INSTRUCTIONS, registerTools } from "../src/tools.ts";

const BASE = "https://app.cloud71.host";
const TOKEN = "tok_test_123";
const NOW = Date.UTC(2026, 9, 29, 12, 0, 0); // 2026-10-29 12:00 UTC

interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

type Responder = Response | (() => Response);

/** Replace global fetch with a stub that records each request and replies in order. */
function stubFetch(...responses: Responder[]): RecordedRequest[] {
  const calls: RecordedRequest[] = [];
  const queue = [...responses];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const req = new Request(input, init);
      const headers: Record<string, string> = {};
      req.headers.forEach((value, key) => {
        headers[key] = value;
      });
      calls.push({
        method: req.method,
        url: req.url,
        headers,
        body: new Uint8Array(await req.arrayBuffer()),
      });
      const next = queue.shift();
      if (!next) throw new Error(`Unexpected fetch: ${req.method} ${req.url}`);
      return typeof next === "function" ? next() : next;
    }),
  );
  return calls;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const bodyJson = (req: RecordedRequest | undefined) =>
  JSON.parse(decode(req?.body ?? new Uint8Array()));

const AUTH = { authorization: `Bearer ${TOKEN}` };
const JSON_HEADERS = { ...AUTH, "content-type": "application/json" };

function textOf(res: CallToolResult): string {
  return res.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

let client: Client;

async function call(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args })) as CallToolResult;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });
  registerTools(server, () => new Cloud71Client(BASE, TOKEN));
  client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const NORTHWIND_SITE = {
  subdomain: "northwind",
  url: "https://northwind.cloud71.site",
  title: "Northwind Coffee",
  tags: ["launch"],
  expiresAt: "2026-11-01T12:00:00.000Z",
  status: "active",
  updatedAt: "2026-10-28T09:30:00.000Z",
  customDomain: "www.northwind.coffee",
  sslStatus: "active",
  liveUrl: "https://www.northwind.coffee",
  isProtected: true,
  leadCaptureEnabled: true,
  visitsThisMonth: 1234,
};

const PLAIN_SITE = {
  subdomain: "cli-ab12cd34",
  url: "https://cli-ab12cd34.cloud71.site",
  title: null,
  tags: [],
  expiresAt: null,
  status: "active",
  updatedAt: "2026-10-20T08:00:00.000Z",
  customDomain: null,
  sslStatus: null,
  liveUrl: "https://cli-ab12cd34.cloud71.site",
  isProtected: false,
  leadCaptureEnabled: false,
  visitsThisMonth: 0,
};

describe("server surface", () => {
  it("advertises version 1.1.0 and the usage instructions", () => {
    expect(client.getServerVersion()).toMatchObject({ name: "cloud71", version: "1.1.0" });
    const instructions = client.getInstructions() ?? "";
    expect(instructions).toContain("stable URL");
    expect(instructions).toContain("402");
    expect(instructions).toContain("rollback_site");
    expect(instructions).toContain("delete_site is permanent");
  });

  it("lists exactly the ten tools with complete annotations", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "delete_site",
        "deploy_files",
        "get_qr_code",
        "get_site_stats",
        "list_sites",
        "list_versions",
        "manage_domain",
        "read_site",
        "rollback_site",
        "update_site",
      ].sort(),
    );
    for (const t of tools) {
      expect(t.description, t.name).toBeTruthy();
      expect(t.annotations?.title, t.name).toBeTruthy();
      for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) {
        expect(
          typeof t.annotations?.[hint as keyof typeof t.annotations],
          `${t.name}.${hint}`,
        ).toBe("boolean");
      }
    }
    const byName = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
    for (const name of [
      "list_sites",
      "read_site",
      "get_site_stats",
      "list_versions",
      "get_qr_code",
    ]) {
      expect(byName[name]?.readOnlyHint, name).toBe(true);
    }
    expect(byName.delete_site).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(byName.update_site).toMatchObject({ readOnlyHint: false, idempotentHint: true });
    expect(byName.rollback_site?.destructiveHint).toBe(false);
  });
});

describe("deploy_files", () => {
  it("uploads a single file with every metadata header", async () => {
    const calls = stubFetch(
      json({
        ok: true,
        siteId: "site_1",
        subdomain: "northwind",
        url: "https://northwind.cloud71.site",
        subdomainUrl: "https://northwind.cloud71.site",
        pathUrl: null,
      }),
    );
    const res = await call("deploy_files", {
      files: [{ path: "index.html", content: "<h1>Hello</h1>" }],
      site: "northwind",
      title: "Northwind Coffee",
      password: "s3cret!",
      lead_capture: true,
      expires_in_hours: 1.5,
    });

    expect(res.isError).toBeFalsy();
    expect(calls).toHaveLength(1);
    const [req] = calls;
    expect(req?.method).toBe("POST");
    expect(req?.url).toBe(`${BASE}/api/cli/deploy`);
    expect(req?.headers).toEqual({
      ...AUTH,
      "content-type": "application/octet-stream",
      "x-c71-filename": "index.html",
      "x-c71-site": "northwind",
      "x-c71-title": "Northwind Coffee",
      "x-c71-password": "s3cret!",
      "x-c71-lead-capture": "true",
      "x-c71-ttl": "5400",
    });
    expect(decode(req?.body ?? new Uint8Array())).toBe("<h1>Hello</h1>");

    const out = textOf(res);
    expect(out).toContain("https://northwind.cloud71.site");
    expect(out).toContain("Password protected.");
    expect(out).toContain("Email capture on.");
    expect(out).toContain("Expires 2026-10-29 13:30 UTC.");
    expect(out).toContain('site: "northwind"');
  });

  it("zips multiple files and sends only the required headers", async () => {
    const calls = stubFetch(
      json({
        ok: true,
        siteId: "site_2",
        subdomain: "cli-ab12cd34",
        url: "https://cli-ab12cd34.cloud71.site",
      }),
    );
    const res = await call("deploy_files", {
      files: [
        { path: "index.html", content: "<link rel=stylesheet href=css/app.css>" },
        { path: "css/app.css", content: "body{color:red}" },
        { path: "img/dot.bin", content: btoa("\x00\x01\x02"), encoding: "base64" },
      ],
      lead_capture: false,
    });

    expect(res.isError).toBeFalsy();
    const [req] = calls;
    expect(req?.headers).toEqual({
      ...AUTH,
      "content-type": "application/octet-stream",
      "x-c71-filename": "site.zip",
      "x-c71-lead-capture": "false",
    });
    const entries = unzipSync(req?.body ?? new Uint8Array());
    expect(Object.keys(entries).sort()).toEqual(["css/app.css", "img/dot.bin", "index.html"]);
    expect(decode(entries["css/app.css"] ?? new Uint8Array())).toBe("body{color:red}");
    expect([...(entries["img/dot.bin"] ?? [])]).toEqual([0, 1, 2]);
    expect(textOf(res)).toContain("Published 3 files to https://cli-ab12cd34.cloud71.site");
  });

  it("applies a non-ASCII title through the settings call instead of a header", async () => {
    const calls = stubFetch(
      json({
        ok: true,
        siteId: "site_1",
        subdomain: "northwind",
        url: "https://northwind.cloud71.site",
      }),
      json({
        ok: true,
        site: "northwind",
        settings: {
          title: "Café ☕",
          isProtected: false,
          leadCaptureEnabled: false,
          expiresAt: null,
          seoTitle: null,
          seoDescription: null,
        },
      }),
    );
    const res = await call("deploy_files", {
      files: [{ path: "index.html", content: "hi" }],
      site: "northwind",
      title: "Café ☕",
    });

    expect(res.isError).toBeFalsy();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.headers["x-c71-title"]).toBeUndefined();
    expect(calls[1]?.url).toBe(`${BASE}/api/cli/manage`);
    expect(calls[1]?.headers).toEqual(JSON_HEADERS);
    expect(bodyJson(calls[1])).toEqual({ site: "northwind", action: "settings", title: "Café ☕" });
  });

  it("folds a non-ASCII single filename into a header-safe one", async () => {
    const calls = stubFetch(
      json({ ok: true, siteId: "s", subdomain: "menu", url: "https://menu.cloud71.site" }),
    );
    const res = await call("deploy_files", {
      files: [{ path: "Café menu.pdf", content: btoa("%PDF-1.4"), encoding: "base64" }],
    });
    expect(res.isError).toBeFalsy();
    expect(calls[0]?.headers["x-c71-filename"]).toBe("Cafe menu.pdf");
    expect(decode(calls[0]?.body ?? new Uint8Array())).toBe("%PDF-1.4");
  });

  it("rejects a non-ASCII deploy password before uploading anything", async () => {
    const calls = stubFetch();
    const res = await call("deploy_files", {
      files: [{ path: "index.html", content: "hi" }],
      password: "pässwörd",
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("update_site");
    expect(calls).toHaveLength(0);
  });
});

describe("list_sites", () => {
  it("formats each site's URL, domain, flags, expiry and visits", async () => {
    const calls = stubFetch(json({ sites: [NORTHWIND_SITE, PLAIN_SITE] }));
    const res = await call("list_sites");

    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/api/cli/sites`, headers: AUTH, body: new Uint8Array() },
    ]);
    const out = textOf(res);
    expect(out).toContain("2 sites:");
    expect(out).toContain('• northwind — "Northwind Coffee" — https://www.northwind.coffee');
    expect(out).toContain("also at https://northwind.cloud71.site");
    expect(out).toContain("custom domain www.northwind.coffee (SSL active)");
    expect(out).toContain("password protected");
    expect(out).toContain("email capture on");
    expect(out).toContain("expires 2026-11-01 12:00 UTC");
    expect(out).toContain("1,234 visits this month");
    expect(out).toContain("• cli-ab12cd34 — https://cli-ab12cd34.cloud71.site");
    expect(out).toContain("0 visits this month");
  });

  it("explains how to start when there are no sites", async () => {
    stubFetch(json({ sites: [] }));
    expect(textOf(await call("list_sites"))).toContain("Use deploy_files");
  });
});

describe("read_site", () => {
  it("reads one file via the read endpoint", async () => {
    const calls = stubFetch(
      json({ site: "northwind", path: "index.html", content: "<h1>Hi</h1>" }),
    );
    const res = await call("read_site", { site: "northwind", path: "index.html" });

    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(`${BASE}/api/cli/read?site=northwind&path=index.html`);
    expect(calls[0]?.headers).toEqual(AUTH);
    expect(JSON.parse(textOf(res))).toEqual({
      site: "northwind",
      path: "index.html",
      content: "<h1>Hi</h1>",
    });
  });
});

describe("update_site", () => {
  const settingsResponse = (overrides: Record<string, unknown> = {}) =>
    json({
      ok: true,
      site: "northwind",
      settings: {
        title: "Northwind",
        isProtected: false,
        leadCaptureEnabled: false,
        expiresAt: NOW + 48 * 3_600_000,
        seoTitle: "Best coffee",
        seoDescription: null,
        ...overrides,
      },
    });

  it("maps every argument onto the settings action", async () => {
    const calls = stubFetch(settingsResponse());
    const res = await call("update_site", {
      site: "northwind",
      title: "Northwind",
      password: null,
      lead_capture: false,
      expires_in_hours: 48,
      seo_title: "Best coffee",
      seo_description: null,
    });

    expect(res.isError).toBeFalsy();
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${BASE}/api/cli/manage`);
    expect(calls[0]?.headers).toEqual(JSON_HEADERS);
    expect(bodyJson(calls[0])).toEqual({
      site: "northwind",
      action: "settings",
      title: "Northwind",
      password: null,
      leadCapture: false,
      expiresAt: NOW + 48 * 3_600_000,
      seoTitle: "Best coffee",
      seoDescription: null,
    });
    const out = textOf(res);
    expect(out).toContain("Password protection: off");
    expect(out).toContain("Expires: 2026-10-31 12:00 UTC");
    expect(out).toContain("SEO description: (not set)");
  });

  it("sends only the fields given, with null meaning never expire", async () => {
    const calls = stubFetch(settingsResponse({ expiresAt: null, isProtected: true }));
    const res = await call("update_site", {
      site: "northwind",
      password: "hunter2",
      expires_in_hours: null,
    });

    expect(bodyJson(calls[0])).toEqual({
      site: "northwind",
      action: "settings",
      password: "hunter2",
      expiresAt: null,
    });
    expect(textOf(res)).toContain("Expires: never");
  });

  it("rejects a call with nothing to change, without calling the API", async () => {
    const calls = stubFetch();
    const res = await call("update_site", { site: "northwind" });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("Nothing to update");
    expect(calls).toHaveLength(0);
  });
});

describe("manage_domain", () => {
  it("adds a domain and explains the DNS records to create", async () => {
    const calls = stubFetch(
      json({
        ok: true,
        site: "northwind",
        domain: "www.northwind.coffee",
        sslStatus: "pending_validation",
        cnameTarget: "northwind.cloud71.site",
        dnsRecords: [{ txtName: "_acme-challenge.www.northwind.coffee", txtValue: "abc123" }],
        note: "Point www.northwind.coffee at northwind.cloud71.site (CNAME).",
      }),
    );
    const res = await call("manage_domain", {
      site: "northwind",
      action: "add",
      domain: "https://WWW.Northwind.Coffee/",
    });

    expect(calls[0]?.url).toBe(`${BASE}/api/cli/manage`);
    expect(calls[0]?.headers).toEqual(JSON_HEADERS);
    expect(bodyJson(calls[0])).toEqual({
      site: "northwind",
      action: "set_domain",
      domain: "www.northwind.coffee",
    });
    const out = textOf(res);
    expect(out).toContain("CNAME  www.northwind.coffee  →  northwind.cloud71.site");
    expect(out).toContain('TXT    _acme-challenge.www.northwind.coffee  =  "abc123"');
    expect(out).toContain("SSL pending validation");
    expect(out).toContain("isn't live yet");
  });

  it("warns about CNAME-at-root for an apex domain", async () => {
    stubFetch(
      json({
        ok: true,
        site: "northwind",
        domain: "northwind.coffee",
        sslStatus: "pending_validation",
        cnameTarget: "northwind.cloud71.site",
        dnsRecords: [],
      }),
    );
    const out = textOf(
      await call("manage_domain", { site: "northwind", action: "add", domain: "northwind.coffee" }),
    );
    expect(out).toContain("root domain");
    expect(out).toContain("ALIAS/ANAME");
  });

  it("reports status of a live domain", async () => {
    const calls = stubFetch(
      json({
        ok: true,
        site: "northwind",
        domain: "www.northwind.coffee",
        sslStatus: "active",
        ready: true,
        cnameTarget: "northwind.cloud71.site",
        dnsRecords: [],
      }),
    );
    const res = await call("manage_domain", { site: "northwind", action: "status" });
    expect(bodyJson(calls[0])).toEqual({ site: "northwind", action: "domain_status" });
    expect(textOf(res)).toContain("www.northwind.coffee is live on northwind (SSL active)");
  });

  it("reports a pending domain with its DNS steps", async () => {
    stubFetch(
      json({
        ok: true,
        site: "northwind",
        domain: "www.northwind.coffee",
        sslStatus: "pending_validation",
        ready: false,
        cnameTarget: "northwind.cloud71.site",
        dnsRecords: [{ txtName: "_acme-challenge.www.northwind.coffee", txtValue: "xyz" }],
      }),
    );
    const out = textOf(await call("manage_domain", { site: "northwind", action: "status" }));
    expect(out).toContain("not live yet");
    expect(out).toContain('"xyz"');
  });

  it("removes a domain", async () => {
    const calls = stubFetch(json({ ok: true, site: "northwind", removed: "www.northwind.coffee" }));
    const res = await call("manage_domain", { site: "northwind", action: "remove" });
    expect(bodyJson(calls[0])).toEqual({ site: "northwind", action: "remove_domain" });
    expect(textOf(res)).toContain("Removed www.northwind.coffee from northwind");
  });

  it("requires a domain for add", async () => {
    const calls = stubFetch();
    const res = await call("manage_domain", { site: "northwind", action: "add" });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("`domain` is required");
    expect(calls).toHaveLength(0);
  });
});

describe("get_site_stats", () => {
  it("summarises usage, months, referrers and leads", async () => {
    const calls = stubFetch(
      json({
        site: "northwind",
        url: "https://northwind.cloud71.site",
        months: [
          {
            yearMonth: "2026-09",
            visits: 800,
            uniqueVisitors: 600,
            bandwidthBytes: 5 * 1024 * 1024,
          },
          { yearMonth: "2026-10", visits: 1234, uniqueVisitors: 900, bandwidthBytes: 12_900_000 },
        ],
        thisMonth: { visits: 1234, uniqueVisitors: 900 },
        visitLimit: 10000,
        topReferrers: [
          { referrer: "google.com", visits: 300 },
          { referrer: "", visits: 200 },
        ],
        leads: { total: 42, last30Days: 5 },
      }),
    );
    const res = await call("get_site_stats", { site: "northwind" });

    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(`${BASE}/api/cli/stats?site=northwind`);
    expect(calls[0]?.headers).toEqual(AUTH);
    const out = textOf(res);
    expect(out).toContain("1,234 visits (900 unique) of 10,000 allowed by the plan (12%)");
    expect(out.indexOf("2026-10")).toBeLessThan(out.indexOf("2026-09"));
    expect(out).toContain("• 2026-09: 800 visits, 600 unique, 5.0 MB served");
    expect(out).toContain("• google.com: 300");
    expect(out).toContain("• (direct / none): 200");
    expect(out).toContain("Email leads: 42 total, 5 in the last 30 days.");
  });

  it("handles an unlimited plan", async () => {
    stubFetch(
      json({
        site: "northwind",
        url: "https://northwind.cloud71.site",
        months: [],
        thisMonth: { visits: 3, uniqueVisitors: 2 },
        visitLimit: null,
        topReferrers: [],
        leads: { total: 0, last30Days: 0 },
      }),
    );
    const out = textOf(await call("get_site_stats", { site: "northwind" }));
    expect(out).toContain("no monthly visit limit");
    expect(out).toContain("none recorded yet");
  });
});

describe("list_versions and rollback_site", () => {
  it("lists versions newest first", async () => {
    const calls = stubFetch(
      json({
        site: "northwind",
        versions: [
          {
            version: 2,
            fileCount: 1,
            bytes: 2048,
            createdAt: "2026-10-20T10:00:00.000Z",
            sourceType: "html",
          },
          {
            version: 3,
            fileCount: 12,
            bytes: 1_258_291,
            createdAt: "2026-10-28T14:02:00.000Z",
            sourceType: "zip",
          },
        ],
      }),
    );
    const res = await call("list_versions", { site: "northwind" });

    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(`${BASE}/api/cli/versions?site=northwind`);
    expect(calls[0]?.headers).toEqual(AUTH);
    const out = textOf(res);
    expect(out).toContain("• v3 — 2026-10-28 14:02 UTC — 12 files, 1.2 MB (zip)");
    expect(out).toContain("• v2 — 2026-10-20 10:00 UTC — 1 file, 2.0 KB (html)");
    expect(out.indexOf("v3")).toBeLessThan(out.indexOf("v2"));
  });

  it("rolls back via the rollback action", async () => {
    const calls = stubFetch(json({ ok: true, site: "northwind", version: 2, bytes: 2048 }));
    const res = await call("rollback_site", { site: "northwind", version: 2 });

    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${BASE}/api/cli/manage`);
    expect(calls[0]?.headers).toEqual(JSON_HEADERS);
    expect(bodyJson(calls[0])).toEqual({ site: "northwind", action: "rollback", version: 2 });
    expect(textOf(res)).toContain("Rolled northwind back to version 2");
    expect(textOf(res)).toContain("undo");
  });
});

describe("get_qr_code", () => {
  it("returns a GIF image and SVG markup for the live URL", async () => {
    const calls = stubFetch(json({ sites: [PLAIN_SITE, NORTHWIND_SITE] }));
    const res = await call("get_qr_code", { site: "Northwind" });

    expect(res.isError).toBeFalsy();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE}/api/cli/sites`);

    const [image, info] = res.content;
    expect(image?.type).toBe("image");
    if (image?.type !== "image") throw new Error("expected an image");
    expect(image.mimeType).toBe("image/gif");
    const bytes = Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0));
    expect(String.fromCharCode(...bytes.slice(0, 6))).toMatch(/^GIF8[79]a$/);
    const width = (bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8);
    const height = (bytes[8] ?? 0) | ((bytes[9] ?? 0) << 8);
    expect(width).toBeGreaterThan(100);
    expect(width).toBe(height);

    expect(info?.type).toBe("text");
    const out = textOf(res);
    expect(out).toContain("https://www.northwind.coffee");
    expect(out).toMatch(/<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(out).toContain("</svg>");
  });

  it("errors for a site that isn't in the account", async () => {
    stubFetch(json({ sites: [PLAIN_SITE] }));
    const res = await call("get_qr_code", { site: "nope" });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('No site named "nope"');
  });
});

describe("delete_site", () => {
  it("deletes via the delete action", async () => {
    const calls = stubFetch(json({ ok: true, site: "northwind", deleted: true }));
    const res = await call("delete_site", { site: "northwind" });

    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${BASE}/api/cli/manage`);
    expect(calls[0]?.headers).toEqual(JSON_HEADERS);
    expect(bodyJson(calls[0])).toEqual({ site: "northwind", action: "delete" });
    expect(textOf(res)).toContain("Deleted northwind");
  });
});

describe("API errors", () => {
  it("turns a 402 into an isError result with an upgrade link", async () => {
    stubFetch(
      json(
        {
          error: "Password protection requires a paid plan.",
          trigger: "feature_paywall",
          feature: "passwordProtection",
        },
        402,
      ),
    );
    const res = await call("deploy_files", {
      files: [{ path: "index.html", content: "hi" }],
      password: "secret",
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe(
      `Password protection requires a paid plan. Upgrade the cloud71 plan to use it: ${BASE}/pricing`,
    );
  });

  it("turns a plain-text 401 into a reconnect message", async () => {
    stubFetch(new Response("Unauthorized", { status: 401 }));
    const res = await call("list_sites");
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe(REAUTH_MESSAGE);
    expect(REAUTH_MESSAGE).toBe(
      "Your cloud71 sign-in expired or was revoked — reconnect the cloud71 connector.",
    );
  });

  it("keeps the API's own message for other errors", async () => {
    stubFetch(json({ error: "Token is missing the 'sites:write' scope." }, 403));
    const res = await call("delete_site", { site: "northwind" });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe("Token is missing the 'sites:write' scope.");
  });

  it("falls back to the status code when the body has no message", async () => {
    stubFetch(new Response("<html>Bad gateway</html>", { status: 502 }));
    const res = await call("get_site_stats", { site: "northwind" });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe("cloud71 API error (HTTP 502).");
  });
});
