/**
 * Blog MCP Tools
 *
 * Tools for blog article management:
 * - COVER_IMAGE_GENERATE - Generate cover images using IMAGE_GENERATOR binding
 * - ARTICLE_FRONTMATTER - Generate valid frontmatter for a new article
 * - ARTICLE_VALIDATE - Validate article markdown structure and frontmatter
 *
 * Filesystem tools (require OBJECT_STORAGE binding):
 * - BLOG_READ_STYLE_GUIDE - Read tone-of-voice.md or visual-style.md
 * - BLOG_LIST_ARTICLES - List all articles
 * - BLOG_READ_ARTICLE - Read an article
 * - BLOG_WRITE_ARTICLE - Write an article
 * - BLOG_DELETE_ARTICLE - Delete an article
 */

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { filesystemTools } from "./filesystem.ts";

// Use any for now to bypass complex type inference issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Env = any;

/**
 * Generate today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Generate a URL-friendly slug from a title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * COVER_IMAGE_GENERATE - Generate cover image following visual style guide
 *
 * IMPORTANT: Before calling this tool, read blog/visual-style.md to get the
 * image generation style guidelines. Use those guidelines to construct the prompt.
 */
export const createCoverImageTool = (env: Env) =>
  createTool({
    id: "COVER_IMAGE_GENERATE",
    description: `Generate a cover image for an article.

IMPORTANT: Before calling this tool, read \`blog/visual-style.md\` to understand the visual style guidelines. The prompt should follow those guidelines.

The tool uses the IMAGE_GENERATOR binding (nanobanana) to generate the image.`,
    inputSchema: z.object({
      prompt: z
        .string()
        .describe(
          "Image generation prompt following the visual style guide from blog/visual-style.md",
        ),
      articleSlug: z
        .string()
        .describe("Article slug - used to name the image file"),
      width: z.number().optional().describe("Image width (default 1200)"),
      height: z.number().optional().describe("Image height (default 630)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      imageUrl: z.string().optional(),
      suggestedPath: z.string().optional(),
      instructions: z.string().optional(),
      error: z.string().optional(),
      suggestion: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const { prompt, articleSlug, width = 1200, height = 630 } = context;
      const imageGenerator = env.bindings?.IMAGE_GENERATOR;

      if (!imageGenerator) {
        return {
          success: false,
          error:
            "IMAGE_GENERATOR binding not configured. Connect the nanobanana MCP to enable image generation.",
          suggestion:
            "You can manually create a cover image and set the coverImage path in the article frontmatter.",
        };
      }

      try {
        // Call the image generator
        const result = await imageGenerator.call("IMAGE_GENERATE", {
          prompt,
          width,
          height,
        });

        return {
          success: true,
          imageUrl: result.url,
          suggestedPath: `/images/articles/${articleSlug}.png`,
          instructions:
            "Download the image and save it to the suggested path, then update the article frontmatter with the coverImage path.",
        };
      } catch (error) {
        return {
          success: false,
          error: `Image generation failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

/**
 * ARTICLE_FRONTMATTER - Generate valid frontmatter for a new article
 */
export const createArticleFrontmatterTool = (_env: Env) =>
  createTool({
    id: "ARTICLE_FRONTMATTER",
    description:
      "Generate valid YAML frontmatter for a new article. Returns the frontmatter block ready to use.",
    inputSchema: z.object({
      title: z.string().describe("Article title"),
      description: z
        .string()
        .describe("Short description for SEO (1-2 sentences)"),
      tags: z.array(z.string()).optional().describe("Article tags"),
      status: z
        .enum(["draft", "published"])
        .optional()
        .describe("Article status (default: draft)"),
    }),
    outputSchema: z.object({
      frontmatter: z.string().describe("YAML frontmatter block"),
      slug: z.string().describe("Generated slug"),
      filePath: z.string().describe("Suggested file path"),
    }),
    execute: async ({ context }) => {
      const { title, description, tags = [], status = "draft" } = context;
      const slug = generateSlug(title);
      const date = getTodayDate();

      const frontmatter = `---
slug: ${slug}
title: "${title.replace(/"/g, '\\"')}"
description: "${description.replace(/"/g, '\\"')}"
date: ${date}
status: ${status}
coverImage: null
tags:
${tags.map((tag) => `  - ${tag}`).join("\n") || "  []"}
---`;

      return {
        frontmatter,
        slug,
        filePath: `blog/articles/${slug}.md`,
      };
    },
  });

/**
 * ARTICLE_VALIDATE - Validate article markdown structure and frontmatter
 */
export const createArticleValidateTool = (_env: Env) =>
  createTool({
    id: "ARTICLE_VALIDATE",
    description:
      "Validate an article's markdown structure and frontmatter. Returns validation results and suggestions.",
    inputSchema: z.object({
      content: z
        .string()
        .describe("Full article content including frontmatter"),
    }),
    outputSchema: z.object({
      valid: z.boolean(),
      issues: z.array(z.string()),
      suggestions: z.array(z.string()),
      stats: z
        .object({
          wordCount: z.number(),
          paragraphCount: z.number(),
          hasHeadings: z.boolean(),
        })
        .optional(),
    }),
    execute: async ({ context }) => {
      const { content } = context;
      const issues: string[] = [];
      const suggestions: string[] = [];

      // Check for frontmatter
      if (!content.startsWith("---")) {
        issues.push("Missing frontmatter block at the start of the file");
        return {
          valid: false,
          issues,
          suggestions: ["Add YAML frontmatter starting with ---"],
        };
      }

      // Extract frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        issues.push("Frontmatter block not properly closed with ---");
        return {
          valid: false,
          issues,
          suggestions: ["Ensure frontmatter ends with ---"],
        };
      }

      const frontmatter = frontmatterMatch[1];
      const body = content.slice(frontmatterMatch[0].length).trim();

      // Check required frontmatter fields
      const requiredFields = ["slug", "title", "description", "date", "status"];
      for (const field of requiredFields) {
        if (!frontmatter.includes(`${field}:`)) {
          issues.push(`Missing required frontmatter field: ${field}`);
        }
      }

      // Check status value
      const statusMatch = frontmatter.match(/status:\s*(draft|published)/);
      if (!statusMatch) {
        issues.push("Status must be 'draft' or 'published'");
      }

      // Check date format
      const dateMatch = frontmatter.match(/date:\s*(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) {
        issues.push("Date should be in YYYY-MM-DD format");
      }

      // Check body content
      if (body.length < 100) {
        suggestions.push(
          "Article body is quite short. Consider adding more content.",
        );
      }

      // Check for headings
      if (!body.includes("#")) {
        suggestions.push(
          "Consider adding section headings for better structure.",
        );
      }

      return {
        valid: issues.length === 0,
        issues,
        suggestions,
        stats: {
          wordCount: body.split(/\s+/).length,
          paragraphCount: body.split(/\n\n+/).length,
          hasHeadings: body.includes("#"),
        },
      };
    },
  });

/**
 * All tool factory functions.
 */
export const tools = [
  createCoverImageTool,
  createArticleFrontmatterTool,
  createArticleValidateTool,
  ...filesystemTools,
];
