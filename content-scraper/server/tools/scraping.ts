/**
 * Scraping Tools
 *
 * Tools to execute scraping of different sources.
 */

import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";
import { createDatabaseClient, type DatabaseClient } from "../lib/db-client.ts";
import { scrapeAllBlogs } from "../lib/blog-scraper.ts";
import {
  scrapeAllLinkedInSources,
  scrapeLinkedInProfile,
} from "../lib/linkedin-scraper.ts";
import {
  scrapeAllRedditSources,
  scrapeSubreddit,
} from "../lib/reddit-scraper.ts";

/**
 * Helper to create database client from env
 */
function createDbClient(env: Env): {
  client: DatabaseClient | null;
  error: string | null;
} {
  const state = env.MESH_REQUEST_CONTEXT?.state;
  const apiUrl = state?.database?.apiUrl ?? "";
  const token = state?.database?.token ?? "";

  if (!apiUrl) {
    return { client: null, error: "Database API URL not configured" };
  }
  if (!token) {
    return { client: null, error: "Database token not configured" };
  }

  try {
    return { client: createDatabaseClient(apiUrl, token), error: null };
  } catch (error) {
    return {
      client: null,
      error: `Failed to connect to database: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Get OpenRouter API key from env
 */
function getOpenRouterApiKey(env: Env): string | null {
  return env.MESH_REQUEST_CONTEXT?.state?.openrouterApiKey ?? null;
}

/**
 * Get Apify API token from env
 */
function getApifyApiToken(env: Env): string | null {
  return env.MESH_REQUEST_CONTEXT?.state?.apifyApiToken ?? null;
}

// =============================================================================
// SCRAPE_ALL Tool
// =============================================================================

export const getScrapeAllTool = (env: Env) =>
  createPrivateTool({
    id: "SCRAPE_ALL",
    description:
      "Executes scraping of ALL registered sources (blogs, LinkedIn and Reddit). May take several minutes.",
    inputSchema: z.object({
      linkedin_max_posts: z
        .number()
        .int()
        .positive()
        .optional()
        .default(5)
        .describe("Maximum posts per LinkedIn profile (default: 5)"),
      reddit_limit: z
        .number()
        .int()
        .positive()
        .optional()
        .default(10)
        .describe("Limit of posts per subreddit (default: 10)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      blogs: z
        .object({
          success: z.boolean(),
          message: z.string(),
          totalSaved: z.number().optional(),
        })
        .optional(),
      linkedin: z
        .object({
          success: z.boolean(),
          message: z.string(),
          saved: z.number(),
          relevant: z.number(),
        })
        .optional(),
      reddit: z
        .object({
          success: z.boolean(),
          message: z.string(),
          saved: z.number(),
          relevant: z.number(),
        })
        .optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { linkedin_max_posts, reddit_limit } = context;

      const { client, error: dbError } = createDbClient(env);
      if (!client) {
        return { success: false, error: dbError ?? "Database error" };
      }

      const openrouterApiKey = getOpenRouterApiKey(env);
      if (!openrouterApiKey) {
        return { success: false, error: "OpenRouter API key not configured" };
      }

      const apifyApiToken = getApifyApiToken(env);

      const results = {
        success: true,
        blogs: { success: false, message: "", totalSaved: 0 },
        linkedin: { success: false, message: "", saved: 0, relevant: 0 },
        reddit: { success: false, message: "", saved: 0, relevant: 0 },
      };

      try {
        // Blogs
        try {
          const blogResult = await scrapeAllBlogs(client, openrouterApiKey);
          results.blogs = {
            success: blogResult.success,
            message: blogResult.message,
            totalSaved: blogResult.totalSaved,
          };
        } catch (error) {
          results.blogs = {
            success: false,
            message: String(error),
            totalSaved: 0,
          };
        }

        // LinkedIn (requires Apify token)
        if (apifyApiToken) {
          try {
            const linkedinResults = await scrapeAllLinkedInSources(
              client,
              openrouterApiKey,
              apifyApiToken,
              linkedin_max_posts,
            );
            const totalSaved = linkedinResults.reduce(
              (sum, r) => sum + r.postsSaved,
              0,
            );
            const totalRelevant = linkedinResults.reduce(
              (sum, r) => sum + r.postsRelevant,
              0,
            );
            results.linkedin = {
              success: true,
              message: `LinkedIn scrape complete (${linkedinResults.length} profiles)`,
              saved: totalSaved,
              relevant: totalRelevant,
            };
          } catch (error) {
            results.linkedin = {
              success: false,
              message: String(error),
              saved: 0,
              relevant: 0,
            };
          }
        } else {
          results.linkedin = {
            success: false,
            message: "Apify API token not configured",
            saved: 0,
            relevant: 0,
          };
        }

        // Reddit
        try {
          const redditResults = await scrapeAllRedditSources(
            client,
            openrouterApiKey,
            reddit_limit,
          );
          const totalSaved = redditResults.reduce(
            (sum, r) => sum + r.postsSaved,
            0,
          );
          const totalRelevant = redditResults.reduce(
            (sum, r) => sum + r.postsRelevant,
            0,
          );
          results.reddit = {
            success: true,
            message: `Reddit scrape complete (${redditResults.length} subreddits)`,
            saved: totalSaved,
            relevant: totalRelevant,
          };
        } catch (error) {
          results.reddit = {
            success: false,
            message: String(error),
            saved: 0,
            relevant: 0,
          };
        }

        return results;
      } finally {
        await client.close();
      }
    },
  });

// =============================================================================
// SCRAPE_BLOGS Tool
// =============================================================================

export const getScrapeBlogsTool = (env: Env) =>
  createPrivateTool({
    id: "SCRAPE_BLOGS",
    description:
      "Executes scraping only of registered blogs. Searches for new articles about MCP.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string().optional(),
      totalSaved: z.number().optional(),
      error: z.string().optional(),
    }),
    execute: async () => {
      const { client, error: dbError } = createDbClient(env);
      if (!client) {
        return { success: false, error: dbError ?? "Database error" };
      }

      const openrouterApiKey = getOpenRouterApiKey(env);
      if (!openrouterApiKey) {
        return { success: false, error: "OpenRouter API key not configured" };
      }

      try {
        const result = await scrapeAllBlogs(client, openrouterApiKey);
        return {
          success: result.success,
          message: result.message,
          totalSaved: result.totalSaved,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      } finally {
        await client.close();
      }
    },
  });

// =============================================================================
// SCRAPE_LINKEDIN Tool
// =============================================================================

export const getScrapeLinkedInTool = (env: Env) =>
  createPrivateTool({
    id: "SCRAPE_LINKEDIN",
    description:
      "Executes scraping of registered LinkedIn profiles. Requires APIFY_API_TOKEN configured.",
    inputSchema: z.object({
      max_posts: z
        .number()
        .int()
        .positive()
        .optional()
        .default(5)
        .describe("Maximum posts per profile (default: 5)"),
      profile_url: z
        .string()
        .optional()
        .describe(
          "Specific profile URL to scrape. If not provided, scrapes all registered profiles.",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      profile: z.string().optional(),
      profiles_processed: z.number().optional(),
      posts_found: z.number().optional(),
      posts_saved: z.number().optional(),
      posts_relevant: z.number().optional(),
      total_saved: z.number().optional(),
      total_relevant: z.number().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { max_posts, profile_url } = context;

      const { client, error: dbError } = createDbClient(env);
      if (!client) {
        return { success: false, error: dbError ?? "Database error" };
      }

      const openrouterApiKey = getOpenRouterApiKey(env);
      if (!openrouterApiKey) {
        return { success: false, error: "OpenRouter API key not configured" };
      }

      const apifyApiToken = getApifyApiToken(env);
      if (!apifyApiToken) {
        return { success: false, error: "Apify API token not configured" };
      }

      try {
        if (profile_url) {
          const result = await scrapeLinkedInProfile(
            client,
            openrouterApiKey,
            apifyApiToken,
            profile_url,
            0.7,
            max_posts,
          );
          return {
            success: true,
            profile: profile_url,
            posts_found: result.postsFound,
            posts_saved: result.postsSaved,
            posts_relevant: result.postsRelevant,
          };
        } else {
          const results = await scrapeAllLinkedInSources(
            client,
            openrouterApiKey,
            apifyApiToken,
            max_posts,
          );
          const totalSaved = results.reduce((sum, r) => sum + r.postsSaved, 0);
          const totalRelevant = results.reduce(
            (sum, r) => sum + r.postsRelevant,
            0,
          );
          return {
            success: true,
            profiles_processed: results.length,
            total_saved: totalSaved,
            total_relevant: totalRelevant,
          };
        }
      } catch (error) {
        return { success: false, error: String(error) };
      } finally {
        await client.close();
      }
    },
  });

// =============================================================================
// SCRAPE_REDDIT Tool
// =============================================================================

export const getScrapeRedditTool = (env: Env) =>
  createPrivateTool({
    id: "SCRAPE_REDDIT",
    description:
      "Executes scraping of registered subreddits. Searches for relevant posts about MCP/AI.",
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .default(10)
        .describe("Limit of posts per subreddit (default: 10)"),
      subreddit: z
        .string()
        .optional()
        .describe(
          "Specific subreddit to scrape (without 'r/'). If not provided, scrapes all registered.",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      subreddit: z.string().optional(),
      subreddits_processed: z.number().optional(),
      posts_found: z.number().optional(),
      posts_saved: z.number().optional(),
      posts_relevant: z.number().optional(),
      total_saved: z.number().optional(),
      total_relevant: z.number().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { limit, subreddit } = context;

      const { client, error: dbError } = createDbClient(env);
      if (!client) {
        return { success: false, error: dbError ?? "Database error" };
      }

      const openrouterApiKey = getOpenRouterApiKey(env);
      if (!openrouterApiKey) {
        return { success: false, error: "OpenRouter API key not configured" };
      }

      try {
        if (subreddit) {
          const result = await scrapeSubreddit(
            client,
            openrouterApiKey,
            subreddit,
            0.7,
            "Community",
            limit,
          );
          return {
            success: true,
            subreddit,
            posts_found: result.postsFound,
            posts_saved: result.postsSaved,
            posts_relevant: result.postsRelevant,
          };
        } else {
          const results = await scrapeAllRedditSources(
            client,
            openrouterApiKey,
            limit,
          );
          const totalSaved = results.reduce((sum, r) => sum + r.postsSaved, 0);
          const totalRelevant = results.reduce(
            (sum, r) => sum + r.postsRelevant,
            0,
          );
          return {
            success: true,
            subreddits_processed: results.length,
            total_saved: totalSaved,
            total_relevant: totalRelevant,
          };
        }
      } catch (error) {
        return { success: false, error: String(error) };
      } finally {
        await client.close();
      }
    },
  });

/**
 * Export all scraping tools
 */
export const scrapingTools = [
  getScrapeAllTool,
  getScrapeBlogsTool,
  getScrapeLinkedInTool,
  getScrapeRedditTool,
];
