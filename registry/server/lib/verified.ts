/**
 * Verified MCP servers by mesh
 *
 * MCPs in this list will have `_meta["mcp.mesh"].verified = true`
 * and appear first in listings.
 *
 * To add a new verified MCP, just add the server name to the array.
 */

export const VERIFIED_SERVERS: string[] = [
  // === Official/Popular MCPs (1st-party from known companies) ===
  // Productivity & Collaboration
  "com.notion/mcp",
  "com.atlassian/atlassian-mcp-server",
  "app.linear/linear",
  "com.monday/monday.com",
  "com.jotform/mcp",
  "com.wix/mcp",
  "net.todoist/mcp",
  "com.mermaidchart/mermaid-mcp",
  "do.craft.mcp/server",

  // Development & DevOps
  "com.cloudflare.mcp/mcp",
  "com.vercel/vercel-mcp",
  "io.prisma/mcp",
  "com.gitlab/mcp",
  "com.supabase/mcp",
  "dev.svelte/mcp",
  "com.stripe/mcp",
  "com.paypal.mcp/mcp",
  "com.postman/postman-mcp-server",
  "com.sonatype/dependency-management-mcp-server",
  "com.amplitude/mcp-server",
  "com.newrelic/mcp-server",
  "com.medusajs/medusa-mcp",
  "io.sanity.www/mcp",
  "com.vaadin/docs-mcp",
  "io.trunk/mcp-server",

  // AI & Search
  "ai.exa/exa",
  "io.twelvelabs/twelvelabs-mcp-server",

  // Data & Analytics
  "io.github.timescale/pg-aiguide",
  "co.axiom/mcp",
  "app.thoughtspot/mcp-server",

  // Microsoft ecosystem
  "com.microsoft/microsoft-learn-mcp",

  // Security
  "com.jumpcloud/jumpcloud-genai",

  // Commerce & Business
  "com.apify/apify-mcp-server",
  "com.teamwork/mcp",
  "com.egnyte/mcp-server",
  "com.stackoverflow.mcp/mcp",
  "com.make/mcp-server",
  "com.blockscout/mcp-server",
  "com.redpanda/docs-mcp",
  "io.fusionauth/mcp-docs",
  "com.thousandeyes/mcp",
  "com.rootly/mcp-server",
  "com.mux/mcp",
];

/**
 * MCPs that should be unlisted (broken OAuth, non-functional, etc.)
 */
export const UNLISTED_SERVERS: string[] = [
  // Broken OAuth
  "com.statsig/statsig-mcp-server",
  "com.smartling/smartling-mcp-server",
  "com.microsoft/agent365-odspremoteserver", // OneDrive and SharePoint
  "com.zomato/mcp",
  "com.webflow/mcp",
  "com.qovery/mcp-server",
  "com.ovhcloud.eu.mcp/api",
  "com.microsoft/agent365-wordserver", // Microsoft Word
  "com.microsoft/agent365-sharepointliststools", // SharePoint
  "com.microsoft/agent365-teamsserver", // Microsoft Teams
  "com.microsoft/agent365-admintools", // Microsoft Admin Center
  "com.microsoft/agent365-meserver", // Microsoft Graph
  "com.keboola/mcp",
  "com.infobip/mcp",
  "com.glean/mcp",
  "com.figma.mcp/mcp",
  "com.epidemicsound/mcp-server",
  "com.devcycle/mcp",
  "com.close/close-mcp",
  "com.brightsec/mcp",
  "com.agilitycms/mcp-server",
  "co.huggingface/hf-mcp-server",
];

/**
 * Server overrides for verified MCPs
 * Use this to add icons/repository when the server doesn't have them
 */
export interface ServerOverride {
  icons?: Array<{ src: string; mimeType?: string; theme?: string }>;
  repository?: { url: string; source?: string };
}

export const VERIFIED_SERVER_OVERRIDES: Record<string, ServerOverride> = {
  // Productivity & Collaboration
  "com.stripe/mcp": {
    icons: [{ src: "https://stripe.com/img/v3/home/twitter.png" }],
  },
  "com.notion/mcp": {
    icons: [{ src: "https://www.notion.so/images/favicon.ico" }],
  },
  "com.atlassian/atlassian-mcp-server": {
    icons: [
      {
        src: "https://wac-cdn.atlassian.com/assets/img/favicons/atlassian/favicon.png",
      },
    ],
  },
  "com.linear/linear": {
    icons: [{ src: "https://linear.app/favicon.ico" }],
  },
  "app.linear/linear": {
    icons: [{ src: "https://linear.app/favicon.ico" }],
  },
  "net.todoist/mcp": {
    icons: [{ src: "https://todoist.com/favicon.ico" }],
  },

  // Development & DevOps
  "com.cloudflare.mcp/mcp": {
    icons: [{ src: "https://www.cloudflare.com/favicon.ico" }],
  },
  "com.vercel/vercel-mcp": {
    icons: [{ src: "https://vercel.com/favicon.ico" }],
  },
  "io.prisma/mcp": {
    icons: [{ src: "https://www.prisma.io/images/favicon-32x32.png" }],
  },
  "com.gitlab/mcp": {
    icons: [{ src: "https://about.gitlab.com/ico/favicon.ico" }],
  },
  "com.supabase/mcp": {
    icons: [{ src: "https://supabase.com/favicon/favicon-32x32.png" }],
  },
  "com.postman/postman-mcp-server": {
    icons: [{ src: "https://www.postman.com/favicon-32x32.png" }],
  },
  "com.sonatype/dependency-management-mcp-server": {
    icons: [{ src: "https://www.sonatype.com/hubfs/favicon.ico" }],
  },
  "com.make/mcp-server": {
    icons: [{ src: "https://www.make.com/favicon.ico" }],
  },

  // AI & Search
  "ai.exa/exa": {
    icons: [{ src: "https://exa.ai/favicon.ico" }],
  },

  // Commerce & Business
  "com.apify/apify-mcp-server": {
    icons: [{ src: "https://apify.com/favicon.ico" }],
  },

  // Microsoft
  "com.microsoft/microsoft-learn-mcp": {
    icons: [{ src: "https://learn.microsoft.com/favicon.ico" }],
  },

  // Data & Analytics
  "co.axiom/mcp": {
    icons: [{ src: "https://github.com/axiomhq.png" }],
  },
  "app.thoughtspot/mcp-server": {
    icons: [{ src: "https://www.thoughtspot.com/favicon.ico" }],
  },
  "com.amplitude/mcp-server": {
    icons: [{ src: "https://amplitude.com/favicon.ico" }],
  },
  "com.newrelic/mcp-server": {
    icons: [{ src: "https://newrelic.com/favicon.ico" }],
  },

  // Security
  "com.jumpcloud/jumpcloud-genai": {
    icons: [
      {
        src: "https://jumpcloud.com/wp-content/uploads/2024/08/cropped-fav-icon-32x32.png",
      },
    ],
  },

  // Identity
  "io.fusionauth/mcp-docs": {
    icons: [{ src: "https://fusionauth.io/img/favicon.png" }],
  },

  // Commerce
  "com.medusajs/medusa-mcp": {
    icons: [{ src: "https://www.medusajs.com/favicon.ico" }],
  },
  "com.monday/monday.com": {
    icons: [
      {
        src: "https://lh3.googleusercontent.com/g41etfSLQlq9RvddIM21H3awOYMW_wX0UK_FkMOvGMy_HTpwnYq4uebT3QjggKbnhYU",
      },
    ],
  },
  "com.egnyte/mcp-server": {
    icons: [{ src: "https://www.egnyte.com/favicon.ico" }],
  },
  "com.blockscout/mcp-server": {
    icons: [{ src: "https://github.com/blockscout.png" }],
  },
  "com.redpanda/docs-mcp": {
    icons: [{ src: "https://redpanda.com/favicon.ico" }],
  },
  "com.thousandeyes/mcp": {
    icons: [
      {
        src: "https://app.thousandeyes.com/static/images/logo_128x128.png",
      },
    ],
  },
  "io.twelvelabs/twelvelabs-mcp-server": {
    icons: [
      {
        src: "https://avatars.githubusercontent.com/u/77832019?s=200&v=4",
      },
    ],
  },
  "io.trunk/mcp-server": {
    icons: [{ src: "https://github.com/trunk-io.png" }],
  },
  "com.rootly/mcp-server": {
    icons: [{ src: "https://rootly.com/favicon.ico" }],
  },
  "com.mux/mcp": {
    icons: [{ src: "https://mux.com/favicon.ico" }],
  },
  "com.stackoverflow.mcp/mcp": {
    icons: [{ src: "https://stackoverflow.com/favicon.ico" }],
  },
  "com.teamwork/mcp": {
    icons: [{ src: "https://www.teamwork.com/favicon.ico" }],
  },
  "com.jotform/mcp": {
    icons: [{ src: "https://www.jotform.com/favicon.ico" }],
  },
};

/**
 * Set for O(1) lookup
 */
export const VERIFIED_SERVERS_SET = new Set(VERIFIED_SERVERS);

/**
 * Check if a server is verified by mesh
 */
export function isServerVerified(name: string): boolean {
  return VERIFIED_SERVERS_SET.has(name);
}

/**
 * Total count of verified servers
 */
export const VERIFIED_SERVERS_COUNT = VERIFIED_SERVERS.length;

/**
 * MCP Mesh metadata to inject into server responses
 */
export interface McpMeshMeta {
  verified: boolean;
}

/**
 * Create the mcp.mesh metadata for a server
 */
export function createMeshMeta(serverName: string): McpMeshMeta {
  return {
    verified: isServerVerified(serverName),
  };
}

/**
 * Get server override if exists
 */
export function getServerOverride(
  serverName: string,
): ServerOverride | undefined {
  return VERIFIED_SERVER_OVERRIDES[serverName];
}

/**
 * Check if server has valid icons
 */
function hasIcons(server: Record<string, unknown>): boolean {
  const icons = server.icons;
  return Array.isArray(icons) && icons.length > 0;
}

/**
 * Check if server has valid repository
 */
function hasRepository(server: Record<string, unknown>): boolean {
  const repo = server.repository;
  return (
    typeof repo === "object" &&
    repo !== null &&
    typeof (repo as Record<string, unknown>).url === "string"
  );
}

/**
 * Apply overrides to a server object (only if icons/repository are missing)
 * Returns a new server object with overrides applied
 */
export function applyServerOverrides(
  serverName: string,
  server: Record<string, unknown>,
): Record<string, unknown> {
  const override = getServerOverride(serverName);
  if (!override) return server;

  const result = { ...server };

  // Apply icons override ONLY if server doesn't have icons
  if (override.icons && !hasIcons(server)) {
    result.icons = override.icons;
  }

  // Apply repository override ONLY if server doesn't have repository
  if (override.repository && !hasRepository(server)) {
    result.repository = override.repository;
  }

  return result;
}
