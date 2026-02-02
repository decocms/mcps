/**
 * Content Tools
 *
 * Tools to list scraped content from the database.
 */

import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";
import {
  createDatabaseClient,
  type DatabaseClient,
  buildSqlQuery,
} from "../lib/db-client.ts";
import type { LinkedInContent, RedditContent } from "../types/content.ts";

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
// LIST_ARTICLES Tool
// =============================================================================

export const getListArticlesTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_ARTICLES",
    description: "Lists scraped blog articles, ordered by score.",
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .default(20)
        .describe("Limit of articles (default: 20)"),
      include_blog_info: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, includes blog information with each article"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      total: z.number().optional(),
      articles: z
        .array(
          z.object({
            id: z.string(),
            title: z.string(),
            url: z.string(),
            published_at: z.string(),
            post_score: z.string(),
            summary: z.string(),
            blog: z
              .object({
                name: z.string(),
                type: z.string(),
                authority: z.string(),
              })
              .optional(),
          }),
        )
        .optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { limit, include_blog_info } = context;

      const { client, error: dbError } = createDbClient(env);
      if (!client) {
        return { success: false, error: dbError ?? "Database error" };
      }

      try {
        interface ArticleRow {
          id: string;
          blog_id: string;
          title: string;
          url: string;
          published_at: string;
          publication_week: string;
          summary: string;
          key_points: string[];
          post_score: number;
          scraped_at: string;
          blog_name?: string;
          blog_url?: string;
          blog_authority?: number;
          blog_type?: string;
        }

        let articles: ArticleRow[];

        if (include_blog_info) {
          const result = await client.query(
            `SELECT 
              a.id, a.blog_id, a.article_title as title, a.article_url as url, 
              a.published_at, a.publication_week, a.summary, a.key_points, 
              a.post_score, a.created_at as scraped_at,
              b.name as blog_name, b.url as blog_url, b.authority as blog_authority, 
              b.type as blog_type
             FROM contents a
             JOIN blog_sources b ON a.blog_id = b.id
             ORDER BY a.created_at DESC, a.post_score DESC
             LIMIT ${limit}`,
          );
          articles = result.rows as unknown as ArticleRow[];
        } else {
          const result = await client.query(
            `SELECT id, blog_id, article_title as title, article_url as url, 
                    published_at, publication_week, summary, key_points, post_score, 
                    created_at as scraped_at
             FROM contents 
             ORDER BY created_at DESC, post_score DESC
             LIMIT ${limit}`,
          );
          articles = result.rows as unknown as ArticleRow[];
        }

        const formattedArticles = articles.map((article) => {
          const base = {
            id: article.id,
            title: article.title,
            url: article.url,
            published_at: article.published_at,
            post_score: `${((article.post_score || 0) * 100).toFixed(0)}%`,
            summary: article.summary,
          };

          if (include_blog_info && article.blog_name) {
            return {
              ...base,
              blog: {
                name: article.blog_name,
                type: article.blog_type || "",
                authority: `${((article.blog_authority || 0) * 100).toFixed(0)}%`,
              },
            };
          }

          return base;
        });

        return {
          success: true,
          total: formattedArticles.length,
          articles: formattedArticles,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      } finally {
        await client.close();
      }
    },
  });

// =============================================================================
// LIST_LINKEDIN_POSTS Tool
// =============================================================================

export const getListLinkedInPostsTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_LINKEDIN_POSTS",
    description: "Lists scraped LinkedIn posts, ordered by relevance score.",
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .default(20)
        .describe("Limit of posts (default: 20)"),
      week: z
        .string()
        .optional()
        .describe(
          "Filter by week in format YYYY-wWW (e.g., 2026-w05). Optional.",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      total: z.number().optional(),
      filter: z.string().optional(),
      posts: z
        .array(
          z.object({
            id: z.number(),
            author: z.string(),
            author_headline: z.string().nullable(),
            content_preview: z.string(),
            url: z.string().nullable(),
            engagement: z.object({
              likes: z.number(),
              comments: z.number(),
              reposts: z.number(),
            }),
            post_score: z.string(),
            published_at: z.string().nullable(),
            week: z.string().nullable(),
          }),
        )
        .optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { limit, week } = context;

      const { client, error: dbError } = createDbClient(env);
      if (!client) {
        return { success: false, error: dbError ?? "Database error" };
      }

      try {
        const baseQuery = week
          ? buildSqlQuery(
              `SELECT id, post_id, url, author_name, author_headline, content,
                      num_likes, num_comments, num_reposts, published_at, 
                      post_score, week_date
               FROM linkedin_content_scrape 
               WHERE week_date = ?
               ORDER BY scraped_at DESC, post_score DESC
               LIMIT ?`,
              [week, limit],
            )
          : `SELECT id, post_id, url, author_name, author_headline, content,
                    num_likes, num_comments, num_reposts, published_at, 
                    post_score, week_date
             FROM linkedin_content_scrape 
             WHERE post_score > 0
             ORDER BY scraped_at DESC, post_score DESC
             LIMIT ${limit}`;

        const result = await client.query(baseQuery);

        const posts = (result.rows as unknown as LinkedInContent[]).map(
          (post) => ({
            id: post.id,
            author: post.author_name || "Unknown",
            author_headline: post.author_headline,
            content_preview:
              (post.content?.slice(0, 200) || "") +
              (post.content && post.content.length > 200 ? "..." : ""),
            url: post.url,
            engagement: {
              likes: post.num_likes || 0,
              comments: post.num_comments || 0,
              reposts: post.num_reposts || 0,
            },
            post_score: `${((post.post_score || 0) * 100).toFixed(0)}%`,
            published_at: post.published_at,
            week: post.week_date,
          }),
        );

        return {
          success: true,
          total: posts.length,
          filter: week ? `week: ${week}` : "all",
          posts,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      } finally {
        await client.close();
      }
    },
  });

// =============================================================================
// LIST_REDDIT_POSTS Tool
// =============================================================================

export const getListRedditPostsTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_REDDIT_POSTS",
    description: "Lists scraped Reddit posts, ordered by relevance score.",
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .default(20)
        .describe("Limit of posts (default: 20)"),
      subreddit: z
        .string()
        .optional()
        .describe("Filter by specific subreddit (without 'r/'). Optional."),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      total: z.number().optional(),
      filter: z.string().optional(),
      posts: z
        .array(
          z.object({
            id: z.number(),
            title: z.string(),
            author: z.string(),
            subreddit: z.string(),
            url: z.string(),
            engagement: z.object({
              score: z.number(),
              comments: z.number(),
            }),
            post_score: z.string(),
            type: z.string(),
            week: z.string().nullable(),
          }),
        )
        .optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { limit, subreddit } = context;

      const { client, error: dbError } = createDbClient(env);
      if (!client) {
        return { success: false, error: dbError ?? "Database error" };
      }

      try {
        const baseQuery = subreddit
          ? buildSqlQuery(
              `SELECT id, title, author, subreddit, url, permalink,
                      score, num_comments, type, post_score, week_date
               FROM reddit_content_scrape 
               WHERE subreddit = ?
               ORDER BY scraped_at DESC, post_score DESC
               LIMIT ?`,
              [subreddit, limit],
            )
          : `SELECT id, title, author, subreddit, url, permalink,
                    score, num_comments, type, post_score, week_date
             FROM reddit_content_scrape 
             WHERE post_score > 0
             ORDER BY scraped_at DESC, post_score DESC
             LIMIT ${limit}`;

        const result = await client.query(baseQuery);

        const posts = (result.rows as unknown as RedditContent[]).map(
          (post) => ({
            id: post.id,
            title: post.title,
            author: post.author,
            subreddit: `r/${post.subreddit}`,
            url: post.permalink,
            engagement: {
              score: post.score || 0,
              comments: post.num_comments || 0,
            },
            post_score: `${((post.post_score || 0) * 100).toFixed(0)}%`,
            type: post.type,
            week: post.week_date,
          }),
        );

        return {
          success: true,
          total: posts.length,
          filter: subreddit ? `r/${subreddit}` : "all",
          posts,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      } finally {
        await client.close();
      }
    },
  });

// =============================================================================
// GET_STATS Tool
// =============================================================================

export const getGetStatsTool = (env: Env) =>
  createPrivateTool({
    id: "GET_STATS",
    description:
      "Returns general system statistics: total sources, scraped posts, etc.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      sources: z
        .object({
          blogs: z.number(),
          linkedin_profiles: z.number(),
          linkedin_profiles_active: z.number(),
          reddit_subreddits: z.number(),
          reddit_subreddits_active: z.number(),
        })
        .optional(),
      content: z
        .object({
          articles: z.number(),
          linkedin_posts: z.number(),
          reddit_posts: z.number(),
        })
        .optional(),
      averageAuthority: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async () => {
      const { client, error: dbError } = createDbClient(env);
      if (!client) {
        return { success: false, error: dbError ?? "Database error" };
      }

      try {
        // Get blog stats
        const blogStatsResult = await client.query(`
          SELECT 
            (SELECT COUNT(*) FROM blog_sources) as total_blogs,
            (SELECT COUNT(*) FROM contents) as total_articles,
            (SELECT COALESCE(AVG(authority), 0) FROM blog_sources) as avg_authority
        `);
        const blogStats = blogStatsResult.rows[0] as {
          total_blogs: number;
          total_articles: number;
          avg_authority: number;
        };

        // Get LinkedIn stats
        const linkedinSourcesResult = await client.query(
          `SELECT COUNT(*) as total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active FROM linkedin_sources`,
        );
        const linkedinSources = linkedinSourcesResult.rows[0] as {
          total: number;
          active: number;
        };

        const linkedinContentResult = await client.query(
          `SELECT COUNT(*) as count FROM linkedin_content_scrape`,
        );
        const linkedinContent = linkedinContentResult.rows[0] as {
          count: number;
        };

        // Get Reddit stats
        const redditSourcesResult = await client.query(
          `SELECT COUNT(*) as total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active FROM reddit_sources`,
        );
        const redditSources = redditSourcesResult.rows[0] as {
          total: number;
          active: number;
        };

        const redditContentResult = await client.query(
          `SELECT COUNT(*) as count FROM reddit_content_scrape`,
        );
        const redditContent = redditContentResult.rows[0] as { count: number };

        return {
          success: true,
          sources: {
            blogs: Number(blogStats.total_blogs) || 0,
            linkedin_profiles: Number(linkedinSources.total) || 0,
            linkedin_profiles_active: Number(linkedinSources.active) || 0,
            reddit_subreddits: Number(redditSources.total) || 0,
            reddit_subreddits_active: Number(redditSources.active) || 0,
          },
          content: {
            articles: Number(blogStats.total_articles) || 0,
            linkedin_posts: Number(linkedinContent.count) || 0,
            reddit_posts: Number(redditContent.count) || 0,
          },
          averageAuthority: `${((Number(blogStats.avg_authority) || 0) * 100).toFixed(0)}%`,
        };
      } catch (error) {
        return { success: false, error: String(error) };
      } finally {
        await client.close();
      }
    },
  });

/**
 * Export all content tools
 */
export const contentTools = [
  getListArticlesTool,
  getListLinkedInPostsTool,
  getListRedditPostsTool,
  getGetStatsTool,
];
