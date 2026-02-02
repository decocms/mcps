/**
 * Sources Tools
 *
 * Tools to list registered sources from the database.
 */

import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";
import { createDatabaseClient, type DatabaseClient } from "../lib/db-client.ts";
import type { Blog, LinkedInSource, RedditSource } from "../types/content.ts";

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

// =============================================================================
// LIST_BLOG_SOURCES Tool
// =============================================================================

export const getListBlogSourcesTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_BLOG_SOURCES",
    description: "Lists all blogs registered as content sources.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      total: z.number().optional(),
      sources: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            url: z.string(),
            type: z.string(),
            authority: z.string(),
          }),
        )
        .optional(),
      error: z.string().optional(),
    }),
    execute: async () => {
      const { client, error: dbError } = createDbClient(env);
      if (!client) {
        return { success: false, error: dbError ?? "Database error" };
      }

      try {
        const result = await client.query(
          `SELECT id, name, url, feed_url, authority, type, created_at 
           FROM blog_sources 
           ORDER BY name ASC`,
        );

        const blogs = result.rows as unknown as Blog[];
        const sources = blogs.map((blog) => ({
          id: blog.id,
          name: blog.name,
          url: blog.url,
          type: blog.type,
          authority: `${((blog.authority || 0) * 100).toFixed(0)}%`,
        }));

        return {
          success: true,
          total: sources.length,
          sources,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      } finally {
        await client.close();
      }
    },
  });

// =============================================================================
// LIST_LINKEDIN_SOURCES Tool
// =============================================================================

export const getListLinkedInSourcesTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_LINKEDIN_SOURCES",
    description: "Lists all LinkedIn profiles registered for monitoring.",
    inputSchema: z.object({
      active_only: z
        .boolean()
        .optional()
        .default(true)
        .describe("If true, lists only active sources (default: true)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      total: z.number().optional(),
      filter: z.string().optional(),
      sources: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            profile_url: z.string(),
            type: z.string(),
            authority: z.string(),
            active: z.boolean(),
          }),
        )
        .optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { active_only } = context;

      const { client, error: dbError } = createDbClient(env);
      if (!client) {
        return { success: false, error: dbError ?? "Database error" };
      }

      try {
        const whereClause = active_only ? "WHERE active = 1" : "";
        const result = await client.query(
          `SELECT id, name, profile_url, authority, type, active, created_at 
           FROM linkedin_sources 
           ${whereClause}
           ORDER BY authority DESC, name ASC`,
        );

        const linkedinSources = result.rows as unknown as LinkedInSource[];
        const sources = linkedinSources.map((source) => ({
          id: source.id,
          name: source.name,
          profile_url: source.profile_url,
          type: source.type,
          authority: `${((source.authority || 0) * 100).toFixed(0)}%`,
          active: Boolean(source.active),
        }));

        return {
          success: true,
          total: sources.length,
          filter: active_only ? "active only" : "all",
          sources,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      } finally {
        await client.close();
      }
    },
  });

// =============================================================================
// LIST_REDDIT_SOURCES Tool
// =============================================================================

export const getListRedditSourcesTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_REDDIT_SOURCES",
    description: "Lists all subreddits registered for monitoring.",
    inputSchema: z.object({
      active_only: z
        .boolean()
        .optional()
        .default(true)
        .describe("If true, lists only active sources (default: true)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      total: z.number().optional(),
      filter: z.string().optional(),
      sources: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            subreddit: z.string(),
            type: z.string(),
            authority: z.string(),
            active: z.boolean(),
          }),
        )
        .optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { active_only } = context;

      const { client, error: dbError } = createDbClient(env);
      if (!client) {
        return { success: false, error: dbError ?? "Database error" };
      }

      try {
        const whereClause = active_only ? "WHERE active = 1" : "";
        const result = await client.query(
          `SELECT id, name, subreddit, authority, type, active, created_at 
           FROM reddit_sources 
           ${whereClause}
           ORDER BY authority DESC, name ASC`,
        );

        const redditSources = result.rows as unknown as RedditSource[];
        const sources = redditSources.map((source) => ({
          id: source.id,
          name: source.name,
          subreddit: `r/${source.subreddit}`,
          type: source.type,
          authority: `${((source.authority || 0) * 100).toFixed(0)}%`,
          active: Boolean(source.active),
        }));

        return {
          success: true,
          total: sources.length,
          filter: active_only ? "active only" : "all",
          sources,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      } finally {
        await client.close();
      }
    },
  });

/**
 * Export all sources tools
 */
export const sourcesTools = [
  getListBlogSourcesTool,
  getListLinkedInSourcesTool,
  getListRedditSourcesTool,
];
