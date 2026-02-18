/**
 * Sitemaps Management Tools
 *
 * Tools for listing, getting, submitting, and deleting sitemaps
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

const SitemapContentSchema = z.object({
  type: z.string().describe("Content type"),
  submitted: z.string().describe("Submission date"),
});

const SitemapSchema = z.object({
  path: z.string().describe("Sitemap path/URL"),
  lastSubmitted: z.string().optional().describe("Last submission date"),
  isPending: z.boolean().optional().describe("Whether the sitemap is pending"),
  isSitemapsIndex: z
    .boolean()
    .optional()
    .describe("Whether this is a sitemap index"),
  lastDownloaded: z.string().optional().describe("Last download date"),
  warnings: z.string().optional().describe("Number of warnings"),
  errors: z.string().optional().describe("Number of errors"),
  contents: z
    .array(SitemapContentSchema)
    .optional()
    .describe("Sitemap contents"),
});

// ============================================================================
// List Sitemaps Tool
// ============================================================================

export const createListSitemapsTool = (env: Env) =>
  createPrivateTool({
    id: "list_sitemaps",
    description: "List all sitemaps for a site",
    inputSchema: z.object({
      siteUrl: z
        .string()
        .describe(
          "Site URL (e.g., 'sc-domain:example.com' or 'https://example.com/')",
        ),
    }),
    outputSchema: z.object({
      sitemaps: z.array(SitemapSchema).describe("List of sitemaps"),
    }),
    execute: async ({ context }) => {
      const client = new SearchConsoleClient({
        accessToken: getAccessToken(env),
      });

      const response = await client.listSitemaps(context.siteUrl);
      const sitemaps = response.sitemap || [];

      return {
        sitemaps: sitemaps.map((sitemap) => ({
          path: sitemap.path,
          lastSubmitted: sitemap.lastSubmitted,
          isPending: sitemap.isPending,
          isSitemapsIndex: sitemap.isSitemapsIndex,
          lastDownloaded: sitemap.lastDownloaded,
          warnings: sitemap.warnings,
          errors: sitemap.errors,
          contents: sitemap.contents?.map((content) => ({
            type: content.type,
            submitted: content.submitted,
          })),
        })),
      };
    },
  });

// ============================================================================
// Get Sitemap Tool
// ============================================================================

export const createGetSitemapTool = (env: Env) =>
  createPrivateTool({
    id: "get_sitemap",
    description: "Get information about a specific sitemap",
    inputSchema: z.object({
      siteUrl: z
        .string()
        .describe(
          "Site URL (e.g., 'sc-domain:example.com' or 'https://example.com/')",
        ),
      feedpath: z.string().describe("Sitemap feedpath/URL"),
    }),
    outputSchema: z.object({
      sitemap: SitemapSchema,
    }),
    execute: async ({ context }) => {
      const client = new SearchConsoleClient({
        accessToken: getAccessToken(env),
      });

      const sitemap = await client.getSitemap(
        context.siteUrl,
        context.feedpath,
      );

      return {
        sitemap: {
          path: sitemap.path,
          lastSubmitted: sitemap.lastSubmitted,
          isPending: sitemap.isPending,
          isSitemapsIndex: sitemap.isSitemapsIndex,
          lastDownloaded: sitemap.lastDownloaded,
          warnings: sitemap.warnings,
          errors: sitemap.errors,
          contents: sitemap.contents?.map((content) => ({
            type: content.type,
            submitted: content.submitted,
          })),
        },
      };
    },
  });

// ============================================================================
// Submit Sitemap Tool
// ============================================================================

export const createSubmitSitemapTool = (env: Env) =>
  createPrivateTool({
    id: "submit_sitemap",
    description: "Submit a sitemap to Google Search Console",
    inputSchema: z.object({
      siteUrl: z
        .string()
        .describe(
          "Site URL (e.g., 'sc-domain:example.com' or 'https://example.com/')",
        ),
      feedpath: z.string().describe("Sitemap feedpath/URL to submit"),
    }),
    outputSchema: z.object({
      success: z
        .boolean()
        .describe("Whether the sitemap was submitted successfully"),
      siteUrl: z.string().describe("The site URL"),
      feedpath: z.string().describe("The sitemap feedpath that was submitted"),
    }),
    execute: async ({ context }) => {
      const client = new SearchConsoleClient({
        accessToken: getAccessToken(env),
      });

      await client.submitSitemap(context.siteUrl, context.feedpath);

      return {
        success: true,
        siteUrl: context.siteUrl,
        feedpath: context.feedpath,
      };
    },
  });

// ============================================================================
// Delete Sitemap Tool
// ============================================================================

export const createDeleteSitemapTool = (env: Env) =>
  createPrivateTool({
    id: "delete_sitemap",
    description: "Delete a sitemap from Google Search Console",
    inputSchema: z.object({
      siteUrl: z
        .string()
        .describe(
          "Site URL (e.g., 'sc-domain:example.com' or 'https://example.com/')",
        ),
      feedpath: z.string().describe("Sitemap feedpath/URL to delete"),
    }),
    outputSchema: z.object({
      success: z
        .boolean()
        .describe("Whether the sitemap was deleted successfully"),
      siteUrl: z.string().describe("The site URL"),
      feedpath: z.string().describe("The sitemap feedpath that was deleted"),
    }),
    execute: async ({ context }) => {
      const client = new SearchConsoleClient({
        accessToken: getAccessToken(env),
      });

      await client.deleteSitemap(context.siteUrl, context.feedpath);

      return {
        success: true,
        siteUrl: context.siteUrl,
        feedpath: context.feedpath,
      };
    },
  });

// ============================================================================
// Export all sitemap tools
// ============================================================================

export const sitemapTools = [
  createListSitemapsTool,
  createGetSitemapTool,
  createSubmitSitemapTool,
  createDeleteSitemapTool,
];
