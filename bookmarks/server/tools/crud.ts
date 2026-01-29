/**
 * Bookmark CRUD Tools
 *
 * Basic create, read, update, delete operations for bookmarks.
 * Requires SUPABASE binding.
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

/**
 * BOOKMARK_LIST - List bookmarks with optional filters
 */
export const createBookmarkListTool = (env: Env) =>
  createTool({
    id: "BOOKMARK_LIST",
    description: `List bookmarks with optional filters.

Filters:
- tag: Filter by tag
- hasResearch: Filter by whether bookmark has been researched
- stars: Filter by minimum stars
- limit: Maximum results (default 50)`,
    inputSchema: z.object({
      tag: z.string().optional().describe("Filter by tag"),
      hasResearch: z.boolean().optional().describe("Filter by research status"),
      minStars: z.number().optional().describe("Minimum stars"),
      limit: z.number().optional().default(50).describe("Maximum results"),
      offset: z
        .number()
        .optional()
        .default(0)
        .describe("Offset for pagination"),
    }),
    handler: async ({ input }) => {
      const supabase = env.bindings?.SUPABASE;

      if (!supabase) {
        return {
          success: false,
          error: "SUPABASE binding not configured",
        };
      }

      try {
        // Build query via Supabase binding
        let query = `
          SELECT b.*, 
            array_agg(t.tag) FILTER (WHERE t.tag IS NOT NULL) as tags
          FROM bookmarks b
          LEFT JOIN bookmark_tags t ON t.bookmark_id = b.id
          WHERE 1=1
        `;

        const params: unknown[] = [];
        let paramIndex = 1;

        if (input.hasResearch !== undefined) {
          if (input.hasResearch) {
            query += ` AND b.researched_at IS NOT NULL`;
          } else {
            query += ` AND b.researched_at IS NULL`;
          }
        }

        if (input.minStars !== undefined) {
          query += ` AND b.stars >= $${paramIndex++}`;
          params.push(input.minStars);
        }

        query += ` GROUP BY b.id ORDER BY b.id DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(input.limit, input.offset);

        const result = await supabase.call("execute_sql", {
          query,
          params,
        });

        // Filter by tag if specified (done in memory since it's an array)
        let bookmarks = result.rows || [];
        if (input.tag) {
          bookmarks = bookmarks.filter(
            (b: { tags: string[] }) => b.tags && b.tags.includes(input.tag!),
          );
        }

        return {
          success: true,
          bookmarks,
          count: bookmarks.length,
          hasMore: bookmarks.length === input.limit,
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to list bookmarks: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * BOOKMARK_GET - Get a single bookmark by URL or ID
 */
export const createBookmarkGetTool = (env: Env) =>
  createTool({
    id: "BOOKMARK_GET",
    description: "Get a single bookmark by URL or ID.",
    inputSchema: z.object({
      url: z.string().optional().describe("Bookmark URL"),
      id: z.number().optional().describe("Bookmark ID"),
    }),
    handler: async ({ input }) => {
      if (!input.url && !input.id) {
        return { success: false, error: "Either url or id is required" };
      }

      const supabase = env.bindings?.SUPABASE;
      if (!supabase) {
        return { success: false, error: "SUPABASE binding not configured" };
      }

      try {
        const query = input.id
          ? `SELECT b.*, array_agg(t.tag) FILTER (WHERE t.tag IS NOT NULL) as tags
             FROM bookmarks b
             LEFT JOIN bookmark_tags t ON t.bookmark_id = b.id
             WHERE b.id = $1
             GROUP BY b.id`
          : `SELECT b.*, array_agg(t.tag) FILTER (WHERE t.tag IS NOT NULL) as tags
             FROM bookmarks b
             LEFT JOIN bookmark_tags t ON t.bookmark_id = b.id
             WHERE b.url = $1
             GROUP BY b.id`;

        const result = await supabase.call("execute_sql", {
          query,
          params: [input.id || input.url],
        });

        if (!result.rows || result.rows.length === 0) {
          return { success: false, error: "Bookmark not found" };
        }

        return { success: true, bookmark: result.rows[0] };
      } catch (error) {
        return {
          success: false,
          error: `Failed to get bookmark: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * BOOKMARK_CREATE - Create a new bookmark
 */
export const createBookmarkCreateTool = (env: Env) =>
  createTool({
    id: "BOOKMARK_CREATE",
    description: "Create a new bookmark.",
    inputSchema: z.object({
      url: z.string().describe("Bookmark URL"),
      title: z.string().optional().describe("Title"),
      description: z.string().optional().describe("Description"),
      tags: z.array(z.string()).optional().describe("Tags"),
      stars: z.number().optional().default(0).describe("Star rating (0-5)"),
      notes: z.string().optional().describe("Personal notes"),
    }),
    handler: async ({ input }) => {
      const supabase = env.bindings?.SUPABASE;
      if (!supabase) {
        return { success: false, error: "SUPABASE binding not configured" };
      }

      try {
        // Insert bookmark
        const insertQuery = `
          INSERT INTO bookmarks (url, title, description, stars, notes)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `;

        const result = await supabase.call("execute_sql", {
          query: insertQuery,
          params: [
            input.url,
            input.title || null,
            input.description || null,
            input.stars,
            input.notes || null,
          ],
        });

        const bookmarkId = result.rows[0].id;

        // Insert tags if provided
        if (input.tags && input.tags.length > 0) {
          const tagValues = input.tags
            .map((_, i) => `($1, $${i + 2})`)
            .join(", ");
          const tagQuery = `
            INSERT INTO bookmark_tags (bookmark_id, tag)
            VALUES ${tagValues}
            ON CONFLICT (bookmark_id, tag) DO NOTHING
          `;

          await supabase.call("execute_sql", {
            query: tagQuery,
            params: [bookmarkId, ...input.tags],
          });
        }

        return {
          success: true,
          id: bookmarkId,
          message: `Bookmark created with ID ${bookmarkId}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes("duplicate key") || errorMsg.includes("unique")) {
          return {
            success: false,
            error: "Bookmark with this URL already exists",
          };
        }
        return {
          success: false,
          error: `Failed to create bookmark: ${errorMsg}`,
        };
      }
    },
  });

/**
 * BOOKMARK_UPDATE - Update an existing bookmark
 */
export const createBookmarkUpdateTool = (env: Env) =>
  createTool({
    id: "BOOKMARK_UPDATE",
    description:
      "Update an existing bookmark. Only provided fields are updated.",
    inputSchema: z.object({
      id: z.number().describe("Bookmark ID"),
      title: z.string().optional(),
      description: z.string().optional(),
      stars: z.number().optional(),
      notes: z.string().optional(),
      tags: z.array(z.string()).optional(),
      perplexity_research: z.string().optional(),
      firecrawl_content: z.string().optional(),
      insight_dev: z.string().optional(),
      insight_founder: z.string().optional(),
      insight_investor: z.string().optional(),
      reading_time_min: z.number().optional(),
      language: z.string().optional(),
      classified_at: z.string().optional().describe("ISO timestamp"),
      researched_at: z.string().optional().describe("ISO timestamp"),
    }),
    handler: async ({ input }) => {
      const supabase = env.bindings?.SUPABASE;
      if (!supabase) {
        return { success: false, error: "SUPABASE binding not configured" };
      }

      try {
        const { id, tags, ...fields } = input;

        // Build dynamic update query
        const updates: string[] = [];
        const params: unknown[] = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) {
            updates.push(`${key} = $${paramIndex++}`);
            params.push(value);
          }
        }

        if (updates.length > 0) {
          params.push(id);
          const updateQuery = `
            UPDATE bookmarks 
            SET ${updates.join(", ")}
            WHERE id = $${paramIndex}
          `;

          await supabase.call("execute_sql", {
            query: updateQuery,
            params,
          });
        }

        // Update tags if provided
        if (tags !== undefined) {
          // Delete existing tags
          await supabase.call("execute_sql", {
            query: "DELETE FROM bookmark_tags WHERE bookmark_id = $1",
            params: [id],
          });

          // Insert new tags
          if (tags.length > 0) {
            const tagValues = tags.map((_, i) => `($1, $${i + 2})`).join(", ");
            await supabase.call("execute_sql", {
              query: `INSERT INTO bookmark_tags (bookmark_id, tag) VALUES ${tagValues}`,
              params: [id, ...tags],
            });
          }
        }

        return { success: true, message: `Bookmark ${id} updated` };
      } catch (error) {
        return {
          success: false,
          error: `Failed to update bookmark: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * BOOKMARK_DELETE - Delete a bookmark
 */
export const createBookmarkDeleteTool = (env: Env) =>
  createTool({
    id: "BOOKMARK_DELETE",
    description: "Delete a bookmark by ID.",
    inputSchema: z.object({
      id: z.number().describe("Bookmark ID to delete"),
    }),
    handler: async ({ input }) => {
      const supabase = env.bindings?.SUPABASE;
      if (!supabase) {
        return { success: false, error: "SUPABASE binding not configured" };
      }

      try {
        await supabase.call("execute_sql", {
          query: "DELETE FROM bookmarks WHERE id = $1",
          params: [input.id],
        });

        return { success: true, message: `Bookmark ${input.id} deleted` };
      } catch (error) {
        return {
          success: false,
          error: `Failed to delete bookmark: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * BOOKMARK_SEARCH - Full-text search across bookmarks
 */
export const createBookmarkSearchTool = (env: Env) =>
  createTool({
    id: "BOOKMARK_SEARCH",
    description:
      "Full-text search across bookmark titles, descriptions, content, and research.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      limit: z.number().optional().default(20).describe("Maximum results"),
    }),
    handler: async ({ input }) => {
      const supabase = env.bindings?.SUPABASE;
      if (!supabase) {
        return { success: false, error: "SUPABASE binding not configured" };
      }

      try {
        const searchTerm = `%${input.query.toLowerCase()}%`;

        const result = await supabase.call("execute_sql", {
          query: `
            SELECT b.id, b.url, b.title, b.description, b.stars, b.classified_at,
              array_agg(t.tag) FILTER (WHERE t.tag IS NOT NULL) as tags
            FROM bookmarks b
            LEFT JOIN bookmark_tags t ON t.bookmark_id = b.id
            WHERE LOWER(b.title) LIKE $1
              OR LOWER(b.description) LIKE $1
              OR LOWER(b.url) LIKE $1
              OR LOWER(b.perplexity_research) LIKE $1
              OR LOWER(b.firecrawl_content) LIKE $1
            GROUP BY b.id
            ORDER BY b.stars DESC, b.id DESC
            LIMIT $2
          `,
          params: [searchTerm, input.limit],
        });

        return {
          success: true,
          results: result.rows || [],
          count: result.rows?.length || 0,
        };
      } catch (error) {
        return {
          success: false,
          error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * All CRUD tool factories
 */
export const crudTools = [
  createBookmarkListTool,
  createBookmarkGetTool,
  createBookmarkCreateTool,
  createBookmarkUpdateTool,
  createBookmarkDeleteTool,
  createBookmarkSearchTool,
];
