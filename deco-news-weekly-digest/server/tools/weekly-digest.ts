/**
 * Weekly Digest Tools
 *
 * Tools to manage weekly digest articles in the deco_weekly_report table.
 */

import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";
import { createDatabaseClient, type DatabaseClient } from "../lib/db-client.ts";

/**
 * Table name for weekly reports
 */
const TABLE_NAME = "deco_weekly_report";

/**
 * Status enum for articles
 */
const StatusEnum = z.enum([
  "draft",
  "pending_review",
  "approved",
  "published",
  "archived",
]);

/**
 * Category enum for articles
 */
const CategoryEnum = z.enum([
  "AI & Machine Learning",
  "eCommerce",
  "Developer Tools",
  "Platform Updates",
  "Community",
  "Tutorials",
  "Case Studies",
  "Industry News",
]);

/**
 * Schema for a weekly report article
 */
const ArticleSchema = z.object({
  id: z.number().optional(),
  url: z.string().url(),
  title: z.string(),
  source_title: z.string().optional(),
  status: StatusEnum.default("draft"),
  created_at: z.string().optional(),
  content: z.string().optional(),
  slug: z.string().optional(),
  summary: z.string().optional(),
  key_points: z.string().optional(),
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  keywords: z.string().optional(),
  category: CategoryEnum.optional(),
  tags: z.string().optional(),
  author: z.string().optional(),
  reading_time: z.number().int().optional(),
  published_at: z.string().optional(),
  image_url: z.string().optional(),
  image_alt_text: z.string().optional(),
});

type Article = z.infer<typeof ArticleSchema>;

/**
 * Escape string for SQL to prevent injection
 */
function escapeSQL(value: string | undefined | null): string {
  if (value === undefined || value === null) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Get database client from environment
 */
function getDbClient(env: Env): {
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
    const client = createDatabaseClient(apiUrl, token);
    return { client, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { client: null, error: `Failed to connect to database: ${message}` };
  }
}

/**
 * LIST_WEEKLY_DIGEST - Lists articles from the weekly digest
 */
export const listWeeklyDigestTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_WEEKLY_DIGEST",
    description:
      "Lists articles from the deco weekly digest. " +
      "Supports pagination, filtering by status, category, and searching by title.",
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .positive()
        .default(20)
        .describe("Maximum number of articles to return (default: 20)"),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Number of articles to skip (default: 0)"),
      status: StatusEnum.optional().describe("Filter by article status"),
      category: CategoryEnum.optional().describe("Filter by category"),
      search: z
        .string()
        .optional()
        .describe("Search term to filter by title or content"),
      orderBy: z
        .enum(["created_at", "published_at", "title", "reading_time"])
        .default("created_at")
        .describe("Field to order by (default: created_at)"),
      orderDirection: z
        .enum(["asc", "desc"])
        .default("desc")
        .describe("Order direction (default: desc)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      articles: z.array(ArticleSchema).optional(),
      totalCount: z.number().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const {
        limit,
        offset,
        status,
        category,
        search,
        orderBy,
        orderDirection,
      } = context;

      const { client, error } = getDbClient(env);
      if (!client) {
        return { success: false, error: error! };
      }

      try {
        const isConnected = await client.testConnection();
        if (!isConnected) {
          return {
            success: false,
            error: "Failed to establish database connection",
          };
        }

        // Build WHERE clause
        const conditions: string[] = [];
        if (status) {
          conditions.push(`status = ${escapeSQL(status)}`);
        }
        if (category) {
          conditions.push(`category = ${escapeSQL(category)}`);
        }
        if (search) {
          const searchTerm = escapeSQL(`%${search}%`);
          conditions.push(
            `(title LIKE ${searchTerm} OR content LIKE ${searchTerm} OR summary LIKE ${searchTerm})`,
          );
        }

        const whereClause =
          conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM ${TABLE_NAME} ${whereClause}`;
        const countResult = await client.query(countQuery);
        const totalCount = Number(countResult.rows[0]?.total) || 0;

        // Get articles
        const query = `
          SELECT * FROM ${TABLE_NAME}
          ${whereClause}
          ORDER BY ${orderBy} ${orderDirection.toUpperCase()}
          LIMIT ${limit}
          OFFSET ${offset}
        `;

        const result = await client.query(query);

        return {
          success: true,
          articles: result.rows as Article[],
          totalCount,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      } finally {
        await client.close();
      }
    },
  });

/**
 * SAVE_WEEKLY_DIGEST_ARTICLE - Creates a new article in the weekly digest
 */
export const saveWeeklyDigestArticleTool = (env: Env) =>
  createPrivateTool({
    id: "SAVE_WEEKLY_DIGEST_ARTICLE",
    description:
      "Saves a new article to the deco weekly digest. " +
      "The article URL must be unique.",
    inputSchema: z.object({
      url: z.string().url().describe("URL of the article (must be unique)"),
      title: z.string().min(1).describe("Title of the article"),
      source_title: z
        .string()
        .optional()
        .describe("Title of the source/publication"),
      status: StatusEnum.default("draft").describe("Status of the article"),
      content: z.string().optional().describe("Full content of the article"),
      slug: z.string().optional().describe("URL-friendly slug for the article"),
      summary: z.string().optional().describe("Brief summary of the article"),
      key_points: z
        .string()
        .optional()
        .describe(
          "Key points from the article (JSON array or comma-separated)",
        ),
      meta_title: z.string().optional().describe("SEO meta title"),
      meta_description: z.string().optional().describe("SEO meta description"),
      keywords: z
        .string()
        .optional()
        .describe("SEO keywords (comma-separated)"),
      category: CategoryEnum.optional().describe("Article category"),
      tags: z.string().optional().describe("Article tags (comma-separated)"),
      author: z.string().optional().describe("Author name"),
      reading_time: z
        .number()
        .int()
        .optional()
        .describe("Estimated reading time in minutes"),
      published_at: z
        .string()
        .optional()
        .describe("Publication date (ISO 8601 format)"),
      image_url: z.string().optional().describe("Main image URL"),
      image_alt_text: z
        .string()
        .optional()
        .describe("Alt text for the main image"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      article: ArticleSchema.optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { client, error } = getDbClient(env);
      if (!client) {
        return { success: false, error: error! };
      }

      try {
        const isConnected = await client.testConnection();
        if (!isConnected) {
          return {
            success: false,
            error: "Failed to establish database connection",
          };
        }

        const now = new Date().toISOString();

        // Generate slug from title if not provided
        const slug =
          context.slug ||
          context.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

        const insertQuery = `
          INSERT INTO ${TABLE_NAME} (
            url, title, source_title, status, created_at, content, slug,
            summary, key_points, meta_title, meta_description, keywords,
            category, tags, author, reading_time, published_at, image_url, image_alt_text
          ) VALUES (
            ${escapeSQL(context.url)},
            ${escapeSQL(context.title)},
            ${escapeSQL(context.source_title)},
            ${escapeSQL(context.status)},
            ${escapeSQL(now)},
            ${escapeSQL(context.content)},
            ${escapeSQL(slug)},
            ${escapeSQL(context.summary)},
            ${escapeSQL(context.key_points)},
            ${escapeSQL(context.meta_title)},
            ${escapeSQL(context.meta_description)},
            ${escapeSQL(context.keywords)},
            ${escapeSQL(context.category)},
            ${escapeSQL(context.tags)},
            ${escapeSQL(context.author)},
            ${context.reading_time ?? "NULL"},
            ${escapeSQL(context.published_at)},
            ${escapeSQL(context.image_url)},
            ${escapeSQL(context.image_alt_text)}
          )
        `;

        await client.query(insertQuery);

        // Fetch the created article
        const selectQuery = `SELECT * FROM ${TABLE_NAME} WHERE url = ${escapeSQL(context.url)}`;
        const result = await client.query(selectQuery);

        return {
          success: true,
          article: result.rows[0] as Article,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        if (
          message.includes("UNIQUE constraint failed") ||
          message.includes("duplicate")
        ) {
          return {
            success: false,
            error: `Article with URL "${context.url}" already exists`,
          };
        }
        return { success: false, error: message };
      } finally {
        await client.close();
      }
    },
  });

/**
 * UPDATE_WEEKLY_DIGEST_ARTICLE - Updates an existing article
 */
export const updateWeeklyDigestArticleTool = (env: Env) =>
  createPrivateTool({
    id: "UPDATE_WEEKLY_DIGEST_ARTICLE",
    description:
      "Updates an existing article in the deco weekly digest. " +
      "Can update by ID or URL.",
    inputSchema: z.object({
      id: z.number().int().optional().describe("Article ID to update"),
      url: z.string().url().optional().describe("Article URL to update"),
      updates: z
        .object({
          title: z.string().optional(),
          source_title: z.string().optional(),
          status: StatusEnum.optional(),
          content: z.string().optional(),
          slug: z.string().optional(),
          summary: z.string().optional(),
          key_points: z.string().optional(),
          meta_title: z.string().optional(),
          meta_description: z.string().optional(),
          keywords: z.string().optional(),
          category: CategoryEnum.optional(),
          tags: z.string().optional(),
          author: z.string().optional(),
          reading_time: z.number().int().optional(),
          published_at: z.string().optional(),
          image_url: z.string().optional(),
          image_alt_text: z.string().optional(),
        })
        .describe("Fields to update"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      article: ArticleSchema.optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { id, url, updates } = context;

      if (!id && !url) {
        return {
          success: false,
          error: "Either id or url must be provided",
        };
      }

      const { client, error } = getDbClient(env);
      if (!client) {
        return { success: false, error: error! };
      }

      try {
        const isConnected = await client.testConnection();
        if (!isConnected) {
          return {
            success: false,
            error: "Failed to establish database connection",
          };
        }

        // Build SET clause
        const setClauses: string[] = [];
        for (const [key, value] of Object.entries(updates)) {
          if (value !== undefined) {
            if (typeof value === "number") {
              setClauses.push(`${key} = ${value}`);
            } else {
              setClauses.push(`${key} = ${escapeSQL(value)}`);
            }
          }
        }

        if (setClauses.length === 0) {
          return {
            success: false,
            error: "No fields to update provided",
          };
        }

        const whereClause = id ? `id = ${id}` : `url = ${escapeSQL(url)}`;

        const updateQuery = `
          UPDATE ${TABLE_NAME}
          SET ${setClauses.join(", ")}
          WHERE ${whereClause}
        `;

        await client.query(updateQuery);

        // Fetch the updated article
        const selectQuery = `SELECT * FROM ${TABLE_NAME} WHERE ${whereClause}`;
        const result = await client.query(selectQuery);

        if (result.rows.length === 0) {
          return {
            success: false,
            error: "Article not found",
          };
        }

        return {
          success: true,
          article: result.rows[0] as Article,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      } finally {
        await client.close();
      }
    },
  });

/**
 * GET_WEEKLY_DIGEST_ARTICLE - Gets a single article by ID, URL, or slug
 */
export const getWeeklyDigestArticleTool = (env: Env) =>
  createPrivateTool({
    id: "GET_WEEKLY_DIGEST_ARTICLE",
    description:
      "Gets a single article from the deco weekly digest by ID, URL, or slug.",
    inputSchema: z.object({
      id: z.number().int().optional().describe("Article ID"),
      url: z.string().url().optional().describe("Article URL"),
      slug: z.string().optional().describe("Article slug"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      article: ArticleSchema.optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { id, url, slug } = context;

      if (!id && !url && !slug) {
        return {
          success: false,
          error: "Either id, url, or slug must be provided",
        };
      }

      const { client, error } = getDbClient(env);
      if (!client) {
        return { success: false, error: error! };
      }

      try {
        const isConnected = await client.testConnection();
        if (!isConnected) {
          return {
            success: false,
            error: "Failed to establish database connection",
          };
        }

        let whereClause: string;
        if (id) {
          whereClause = `id = ${id}`;
        } else if (url) {
          whereClause = `url = ${escapeSQL(url)}`;
        } else {
          whereClause = `slug = ${escapeSQL(slug)}`;
        }

        const query = `SELECT * FROM ${TABLE_NAME} WHERE ${whereClause}`;
        const result = await client.query(query);

        if (result.rows.length === 0) {
          return {
            success: false,
            error: "Article not found",
          };
        }

        return {
          success: true,
          article: result.rows[0] as Article,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      } finally {
        await client.close();
      }
    },
  });

/**
 * DELETE_WEEKLY_DIGEST_ARTICLE - Deletes an article by ID or URL
 */
export const deleteWeeklyDigestArticleTool = (env: Env) =>
  createPrivateTool({
    id: "DELETE_WEEKLY_DIGEST_ARTICLE",
    description: "Deletes an article from the deco weekly digest by ID or URL.",
    inputSchema: z.object({
      id: z.number().int().optional().describe("Article ID to delete"),
      url: z.string().url().optional().describe("Article URL to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { id, url } = context;

      if (!id && !url) {
        return {
          success: false,
          error: "Either id or url must be provided",
        };
      }

      const { client, error } = getDbClient(env);
      if (!client) {
        return { success: false, error: error! };
      }

      try {
        const isConnected = await client.testConnection();
        if (!isConnected) {
          return {
            success: false,
            error: "Failed to establish database connection",
          };
        }

        const whereClause = id ? `id = ${id}` : `url = ${escapeSQL(url)}`;

        // Check if article exists first
        const checkQuery = `SELECT id FROM ${TABLE_NAME} WHERE ${whereClause}`;
        const checkResult = await client.query(checkQuery);

        if (checkResult.rows.length === 0) {
          return {
            success: false,
            error: "Article not found",
          };
        }

        const deleteQuery = `DELETE FROM ${TABLE_NAME} WHERE ${whereClause}`;
        await client.query(deleteQuery);

        return {
          success: true,
          message: `Article successfully deleted`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      } finally {
        await client.close();
      }
    },
  });

/**
 * PUBLISH_WEEKLY_DIGEST_ARTICLE - Publishes an article (changes status to published)
 */
export const publishWeeklyDigestArticleTool = (env: Env) =>
  createPrivateTool({
    id: "PUBLISH_WEEKLY_DIGEST_ARTICLE",
    description:
      "Publishes an article in the deco weekly digest. " +
      "Changes status to 'published' and sets published_at to current time.",
    inputSchema: z.object({
      id: z.number().int().optional().describe("Article ID to publish"),
      url: z.string().url().optional().describe("Article URL to publish"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      article: ArticleSchema.optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { id, url } = context;

      if (!id && !url) {
        return {
          success: false,
          error: "Either id or url must be provided",
        };
      }

      const { client, error } = getDbClient(env);
      if (!client) {
        return { success: false, error: error! };
      }

      try {
        const isConnected = await client.testConnection();
        if (!isConnected) {
          return {
            success: false,
            error: "Failed to establish database connection",
          };
        }

        const whereClause = id ? `id = ${id}` : `url = ${escapeSQL(url)}`;

        const now = new Date().toISOString();

        const updateQuery = `
          UPDATE ${TABLE_NAME}
          SET status = 'published', published_at = ${escapeSQL(now)}
          WHERE ${whereClause}
        `;

        await client.query(updateQuery);

        // Fetch the updated article
        const selectQuery = `SELECT * FROM ${TABLE_NAME} WHERE ${whereClause}`;
        const result = await client.query(selectQuery);

        if (result.rows.length === 0) {
          return {
            success: false,
            error: "Article not found",
          };
        }

        return {
          success: true,
          article: result.rows[0] as Article,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      } finally {
        await client.close();
      }
    },
  });

/**
 * Export all weekly digest tools
 */
export const weeklyDigestTools = [
  listWeeklyDigestTool,
  saveWeeklyDigestArticleTool,
  updateWeeklyDigestArticleTool,
  getWeeklyDigestArticleTool,
  deleteWeeklyDigestArticleTool,
  publishWeeklyDigestArticleTool,
];
