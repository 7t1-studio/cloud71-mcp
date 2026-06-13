import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { Cloud71Client, type DeployFile } from "./cloud71.ts";
import type { Env, Props } from "./types.ts";

/**
 * The cloud71 MCP server. One Durable Object instance per MCP session; `this.props`
 * carries the signed-in user's cloud71 token (set during OAuth), and every tool
 * acts only on that user's account.
 */
export class Cloud71MCP extends McpAgent<Env, unknown, Props> {
  server = new McpServer({ name: "cloud71", version: "1.0.0" });

  private client(): Cloud71Client {
    const token = this.props?.cloud71Token;
    if (!token) throw new Error("Not authenticated with cloud71. Please reconnect the connector.");
    return new Cloud71Client(this.env.CLOUD71_BASE_URL, token);
  }

  async init() {
    this.server.registerTool(
      "deploy_files",
      {
        title: "Deploy files to cloud71",
        description:
          "Publish one or more files to live hosting on cloud71 and return the public URL. " +
          "Accepts ANY content — a single HTML page, a PDF, an image, an Office document, or a " +
          "whole website/folder (pass multiple files with relative paths like 'index.html', " +
          "'css/app.css'). Set `site` to a subdomain to update that existing site; omit it to " +
          "create a new one. Returns a https://<name>.cloud71.site URL that's live in seconds.",
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
            .optional()
            .describe("Existing site subdomain to update; omit to create a new site."),
        },
        annotations: {
          title: "Deploy files to cloud71",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async ({ files, site }) => {
        const result = await this.client().deploy(files as DeployFile[], { site });
        return {
          content: [
            {
              type: "text",
              text: `Published ${files.length} file(s). Live at ${result.url} (subdomain "${result.subdomain}"). It goes live within a few seconds.`,
            },
          ],
        };
      },
    );

    this.server.registerTool(
      "list_sites",
      {
        title: "List my cloud71 sites",
        description: "List the sites in your cloud71 account — name, public URL, and status.",
        inputSchema: {},
        annotations: {
          title: "List my cloud71 sites",
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: true,
        },
      },
      async () => {
        const { sites } = await this.client().listSites();
        const text = sites.length
          ? sites.map((s) => `• ${s.subdomain} — ${s.url} (${s.status})`).join("\n")
          : "You don't have any sites yet. Use deploy_files to publish your first one.";
        return { content: [{ type: "text", text }] };
      },
    );

    this.server.registerTool(
      "read_site",
      {
        title: "Read a cloud71 site",
        description:
          "Read a site's files and status so you can edit then redeploy. Without `path`, lists " +
          "the site's files; with `path`, returns that file's text contents.",
        inputSchema: {
          site: z.string().describe("The site subdomain."),
          path: z.string().optional().describe("A file path to read; omit to list files."),
        },
        annotations: {
          title: "Read a cloud71 site",
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: true,
        },
      },
      async ({ site, path }) => {
        const data = await this.client().readSite(site, path);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    this.server.registerTool(
      "manage_site",
      {
        title: "Manage a cloud71 site",
        description:
          "Rename a site, attach a custom domain, or delete a site. `action='delete'` is " +
          "DESTRUCTIVE — it permanently removes the site and stops serving it.",
        inputSchema: {
          site: z.string().describe("The site subdomain."),
          action: z.enum(["rename", "set_domain", "delete"]).describe("What to do."),
          title: z.string().optional().describe("New display title (for action='rename')."),
          domain: z
            .string()
            .optional()
            .describe("Custom domain to attach (for action='set_domain', e.g. www.example.com)."),
        },
        annotations: {
          title: "Manage a cloud71 site",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async ({ site, action, title, domain }) => {
        const data = await this.client().manageSite({ site, action, title, domain });
        return {
          content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }],
        };
      },
    );
  }
}
