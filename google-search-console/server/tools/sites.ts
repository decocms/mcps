/**
 * Sites Management Tools
 *
 * Tools for listing, getting, adding, and removing sites
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../main.ts";
import {
  SearchConsoleClient,
  getAccessToken,
} from "../lib/search-console-client.ts";

// ============================================================================
// Schema Definitions
// ============================================================================

const SiteEntrySchema = z.object({
  siteUrl: z.string().describe("Site URL"),
  permissionLevel: z
    .enum([
      "siteOwner",
      "siteFullUser",
      "siteRestrictedUser",
      "siteUnverifiedUser",
    ])
    .describe("Permission level for the site"),
});

// ============================================================================
// List Sites Tool
// ============================================================================

export const createListSitesTool = (env: Env) =>
  createPrivateTool({
    id: "list_sites",
    description:
      "List all sites in Google Search Console for the authenticated user",
    inputSchema: z.object({}),
    outputSchema: z.object({
      sites: z.array(SiteEntrySchema).describe("List of sites"),
    }),
    execute: async () => {
      const client = new SearchConsoleClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listSites();
      const sites = response.siteEntry || [];

      return {
        sites: sites.map((site) => ({
          siteUrl: site.siteUrl,
          permissionLevel: site.permissionLevel,
        })),
      };
    },
  });

// ============================================================================
// Get Site Tool
// ============================================================================

export const createGetSiteTool = (env: Env) =>
  createPrivateTool({
    id: "get_site",
    description: "Get information about a specific site",
    inputSchema: z.object({
      siteUrl: z
        .string()
        .describe(
          "Site URL (e.g., 'sc-domain:example.com' or 'https://example.com/')",
        ),
    }),
    outputSchema: z.object({
      site: SiteEntrySchema,
    }),
    execute: async ({ context }) => {
      const client = new SearchConsoleClient({
        accessToken: getAccessToken(env),
      });

      const site = await client.getSite(context.siteUrl);

      return {
        site: {
          siteUrl: site.siteUrl,
          permissionLevel: site.permissionLevel,
        },
      };
    },
  });

// ============================================================================
// Add Site Tool
// ============================================================================

export const createAddSiteTool = (env: Env) =>
  createPrivateTool({
    id: "add_site",
    description: "Add a new site to Google Search Console",
    inputSchema: z.object({
      siteUrl: z
        .string()
        .describe(
          "Site URL to add (e.g., 'sc-domain:example.com' or 'https://example.com/')",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean().describe("Whether the site was added successfully"),
      siteUrl: z.string().describe("The site URL that was added"),
    }),
    execute: async ({ context }) => {
      const client = new SearchConsoleClient({
        accessToken: getAccessToken(env),
      });

      await client.addSite(context.siteUrl);

      return {
        success: true,
        siteUrl: context.siteUrl,
      };
    },
  });

// ============================================================================
// Remove Site Tool
// ============================================================================

export const createRemoveSiteTool = (env: Env) =>
  createPrivateTool({
    id: "remove_site",
    description: "Remove a site from Google Search Console",
    inputSchema: z.object({
      siteUrl: z
        .string()
        .describe(
          "Site URL to remove (e.g., 'sc-domain:example.com' or 'https://example.com/')",
        ),
    }),
    outputSchema: z.object({
      success: z
        .boolean()
        .describe("Whether the site was removed successfully"),
      siteUrl: z.string().describe("The site URL that was removed"),
    }),
    execute: async ({ context }) => {
      const client = new SearchConsoleClient({
        accessToken: getAccessToken(env),
      });

      await client.removeSite(context.siteUrl);

      return {
        success: true,
        siteUrl: context.siteUrl,
      };
    },
  });

// ============================================================================
// Export all site tools
// ============================================================================

export const siteTools = [
  createListSitesTool,
  createGetSiteTool,
  createAddSiteTool,
  createRemoveSiteTool,
];
