/**
 * Bookmark Import Tools
 *
 * Import bookmarks from browser exports (Chrome, Firefox).
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../types/env.ts";

/**
 * Parse Chrome bookmark export (HTML format)
 */
function parseChromeBookmarks(html: string): Array<{
  url: string;
  title: string;
  addedAt?: Date;
}> {
  const bookmarks: Array<{ url: string; title: string; addedAt?: Date }> = [];

  // Match <A HREF="url" ADD_DATE="timestamp">title</A>
  const regex =
    /<A\s+HREF="([^"]+)"[^>]*(?:ADD_DATE="(\d+)")?[^>]*>([^<]*)<\/A>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const url = match[1];
    const addDate = match[2];
    const title = match[3].trim();

    // Skip javascript: and chrome: URLs
    if (url.startsWith("javascript:") || url.startsWith("chrome:")) {
      continue;
    }

    bookmarks.push({
      url,
      title: title || url,
      addedAt: addDate ? new Date(parseInt(addDate, 10) * 1000) : undefined,
    });
  }

  return bookmarks;
}

/**
 * Parse Firefox bookmark export (JSON format from about:support or HTML)
 */
function parseFirefoxBookmarks(
  content: string,
): Array<{ url: string; title: string; addedAt?: Date }> {
  const bookmarks: Array<{ url: string; title: string; addedAt?: Date }> = [];

  // Try JSON format first (from about:support)
  try {
    const data = JSON.parse(content);

    function extractFromJson(node: {
      uri?: string;
      title?: string;
      dateAdded?: number;
      children?: unknown[];
    }) {
      if (node.uri && !node.uri.startsWith("place:")) {
        bookmarks.push({
          url: node.uri,
          title: node.title || node.uri,
          addedAt: node.dateAdded ? new Date(node.dateAdded / 1000) : undefined,
        });
      }
      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          extractFromJson(child as typeof node);
        }
      }
    }

    extractFromJson(data);
    return bookmarks;
  } catch {
    // Not JSON, try HTML format (same as Chrome)
    return parseChromeBookmarks(content);
  }
}

/**
 * BOOKMARK_IMPORT_CHROME - Import bookmarks from Chrome HTML export
 */
export const createBookmarkImportChromeTool = (env: Env) =>
  createTool({
    id: "BOOKMARK_IMPORT_CHROME",
    description: `Import bookmarks from a Chrome HTML export file.

To export from Chrome:
1. Open chrome://bookmarks
2. Click the three dots menu
3. Select "Export bookmarks"

Provide the HTML content from the exported file.`,
    inputSchema: z.object({
      html: z.string().describe("HTML content from Chrome bookmark export"),
      skipDuplicates: z
        .boolean()
        .optional()
        .default(true)
        .describe("Skip bookmarks that already exist"),
    }),
    handler: async ({ input }) => {
      const supabase = env.bindings?.SUPABASE;
      if (!supabase) {
        return { success: false, error: "SUPABASE binding not configured" };
      }

      try {
        const bookmarks = parseChromeBookmarks(input.html);

        if (bookmarks.length === 0) {
          return {
            success: false,
            error: "No bookmarks found in the HTML content",
          };
        }

        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const bookmark of bookmarks) {
          try {
            if (input.skipDuplicates) {
              // Check if exists
              const existing = await supabase.call("execute_sql", {
                query: "SELECT id FROM bookmarks WHERE url = $1",
                params: [bookmark.url],
              });
              if (existing.rows && existing.rows.length > 0) {
                skipped++;
                continue;
              }
            }

            await supabase.call("execute_sql", {
              query: `
                INSERT INTO bookmarks (url, title, created_at)
                VALUES ($1, $2, $3)
                ON CONFLICT (url) DO NOTHING
              `,
              params: [
                bookmark.url,
                bookmark.title,
                bookmark.addedAt?.toISOString() || new Date().toISOString(),
              ],
            });
            imported++;
          } catch (error) {
            errors.push(
              `${bookmark.url}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        return {
          success: true,
          total: bookmarks.length,
          imported,
          skipped,
          errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
        };
      } catch (error) {
        return {
          success: false,
          error: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * BOOKMARK_IMPORT_FIREFOX - Import bookmarks from Firefox export
 */
export const createBookmarkImportFirefoxTool = (env: Env) =>
  createTool({
    id: "BOOKMARK_IMPORT_FIREFOX",
    description: `Import bookmarks from a Firefox export.

Supports both:
- HTML export (from Library > Import and Backup > Export Bookmarks to HTML)
- JSON export (from about:support)

Provide the file content.`,
    inputSchema: z.object({
      content: z.string().describe("Content from Firefox bookmark export"),
      skipDuplicates: z
        .boolean()
        .optional()
        .default(true)
        .describe("Skip bookmarks that already exist"),
    }),
    handler: async ({ input }) => {
      const supabase = env.bindings?.SUPABASE;
      if (!supabase) {
        return { success: false, error: "SUPABASE binding not configured" };
      }

      try {
        const bookmarks = parseFirefoxBookmarks(input.content);

        if (bookmarks.length === 0) {
          return {
            success: false,
            error: "No bookmarks found in the content",
          };
        }

        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const bookmark of bookmarks) {
          try {
            if (input.skipDuplicates) {
              const existing = await supabase.call("execute_sql", {
                query: "SELECT id FROM bookmarks WHERE url = $1",
                params: [bookmark.url],
              });
              if (existing.rows && existing.rows.length > 0) {
                skipped++;
                continue;
              }
            }

            await supabase.call("execute_sql", {
              query: `
                INSERT INTO bookmarks (url, title, created_at)
                VALUES ($1, $2, $3)
                ON CONFLICT (url) DO NOTHING
              `,
              params: [
                bookmark.url,
                bookmark.title,
                bookmark.addedAt?.toISOString() || new Date().toISOString(),
              ],
            });
            imported++;
          } catch (error) {
            errors.push(
              `${bookmark.url}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        return {
          success: true,
          total: bookmarks.length,
          imported,
          skipped,
          errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
        };
      } catch (error) {
        return {
          success: false,
          error: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * All import tool factories
 */
export const importTools = [
  createBookmarkImportChromeTool,
  createBookmarkImportFirefoxTool,
];
