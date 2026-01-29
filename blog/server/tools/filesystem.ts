/**
 * Filesystem Tools for Blog MCP
 *
 * Uses OBJECT_STORAGE binding to read/write blog files directly.
 * When OBJECT_STORAGE is connected, the blog MCP becomes fully self-contained.
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";

// Use any for now to bypass complex type inference issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Env = any;

/**
 * BLOG_READ_STYLE_GUIDE - Read the tone of voice or visual style guide
 */
export const createReadStyleGuideTool = (env: Env) =>
  createTool({
    id: "BLOG_READ_STYLE_GUIDE",
    description: `Read the tone of voice or visual style guide from the blog folder.

Requires OBJECT_STORAGE binding connected to a folder with a blog/ subfolder.`,
    inputSchema: z.object({
      guide: z
        .enum(["tone-of-voice", "visual-style"])
        .describe("Which guide to read"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      content: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const storage = env.bindings?.OBJECT_STORAGE;

      if (!storage) {
        return {
          success: false,
          error:
            "OBJECT_STORAGE binding not configured. Connect a local-fs MCP pointing to a folder with a blog/ subfolder.",
        };
      }

      try {
        const path = `blog/${context.guide}.md`;
        // Use read_file which is available on local-fs
        const result = await (storage as any).call("read_text_file", { path });
        return {
          success: true,
          content: result.content || result,
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to read ${context.guide}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * BLOG_LIST_ARTICLES - List all articles in the blog/articles folder
 */
export const createListArticlesTool = (env: Env) =>
  createTool({
    id: "BLOG_LIST_ARTICLES",
    description: `List all article files in the blog/articles folder.

Requires OBJECT_STORAGE binding.`,
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      articles: z.array(z.string()).optional(),
      count: z.number().optional(),
      error: z.string().optional(),
    }),
    execute: async () => {
      const storage = env.bindings?.OBJECT_STORAGE;

      if (!storage) {
        return {
          success: false,
          error: "OBJECT_STORAGE binding not configured.",
        };
      }

      try {
        const result = await storage.call("LIST_OBJECTS", {
          prefix: "blog/articles/",
          delimiter: "/",
        });

        const files = (result.objects || [])
          .filter((obj: { key: string }) => obj.key.endsWith(".md"))
          .map((obj: { key: string }) => {
            const filename = obj.key.split("/").pop() || "";
            return filename.replace(".md", "");
          });

        return {
          success: true,
          articles: files,
          count: files.length,
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to list articles: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * BLOG_READ_ARTICLE - Read an article's content
 */
export const createReadArticleTool = (env: Env) =>
  createTool({
    id: "BLOG_READ_ARTICLE",
    description: `Read an article from blog/articles/{slug}.md.

Requires OBJECT_STORAGE binding.`,
    inputSchema: z.object({
      slug: z.string().describe("Article slug (filename without .md)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      content: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const storage = env.bindings?.OBJECT_STORAGE;

      if (!storage) {
        return {
          success: false,
          error: "OBJECT_STORAGE binding not configured.",
        };
      }

      try {
        const path = `blog/articles/${context.slug}.md`;
        // Use read_text_file which is available on local-fs
        const result = await (storage as any).call("read_text_file", { path });
        return {
          success: true,
          content: result.content || result,
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to read article: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * BLOG_WRITE_ARTICLE - Write an article to blog/articles/{slug}.md
 */
export const createWriteArticleTool = (env: Env) =>
  createTool({
    id: "BLOG_WRITE_ARTICLE",
    description: `Write an article to blog/articles/{slug}.md.

The content should include YAML frontmatter. Use ARTICLE_FRONTMATTER to generate it.

Requires OBJECT_STORAGE binding.`,
    inputSchema: z.object({
      slug: z.string().describe("Article slug (becomes filename)"),
      content: z
        .string()
        .describe("Full article content including YAML frontmatter"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      path: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const storage = env.bindings?.OBJECT_STORAGE;

      if (!storage) {
        return {
          success: false,
          error: "OBJECT_STORAGE binding not configured.",
        };
      }

      try {
        const path = `blog/articles/${context.slug}.md`;
        // Use write_file which is available on local-fs
        await (storage as any).call("write_file", {
          path,
          content: context.content,
        });
        return {
          success: true,
          path,
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to write article: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * BLOG_DELETE_ARTICLE - Delete an article
 */
export const createDeleteArticleTool = (env: Env) =>
  createTool({
    id: "BLOG_DELETE_ARTICLE",
    description: `Delete an article from blog/articles/{slug}.md.

Requires OBJECT_STORAGE binding.`,
    inputSchema: z.object({
      slug: z.string().describe("Article slug to delete"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const storage = env.bindings?.OBJECT_STORAGE;

      if (!storage) {
        return {
          success: false,
          error: "OBJECT_STORAGE binding not configured.",
        };
      }

      try {
        const path = `blog/articles/${context.slug}.md`;
        await storage.call("DELETE_OBJECT", { key: path });
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: `Failed to delete article: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * All filesystem tool factories
 */
export const filesystemTools = [
  createReadStyleGuideTool,
  createListArticlesTool,
  createReadArticleTool,
  createWriteArticleTool,
  createDeleteArticleTool,
];
