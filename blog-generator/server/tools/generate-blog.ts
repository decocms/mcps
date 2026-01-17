/**
 * Blog Generator Tool
 *
 * Tool to generate blog posts from various context types using n8n webhook.
 */

import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";

/**
 * Context type enum
 */
const ContextTypeEnum = z.enum(["text", "url", "json"]);

/**
 * Blog post schema
 */
const BlogPostSchema = z.object({
  title: z.string().describe("Blog post title"),
  content: z.string().describe("Full blog post content"),
  summary: z.string().describe("Blog post summary"),
});

/**
 * Generate blog post tool - generates blog posts from context
 */
export const generateBlogTool = (env: Env) =>
  createPrivateTool({
    id: "generate_blog_post",
    description:
      "Generate blog post suggestions from context. " +
      "Accepts plain text, URL, or JSON from content-scraper as context. " +
      "Returns 4 blog post suggestions with title, content, and summary.",
    inputSchema: z.object({
      contextType: ContextTypeEnum.describe(
        'Context type: "text" for plain text, "url" for URL, "json" for content-scraper data',
      ),
      textContext: z
        .string()
        .optional()
        .describe('Plain text as context (when contextType = "text")'),
      urlContext: z
        .string()
        .optional()
        .describe('URL to use as context (when contextType = "url")'),
      jsonContext: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'JSON from content-scraper or similar structure (when contextType = "json")',
        ),
      additionalInstructions: z
        .string()
        .optional()
        .describe("Additional instructions for blog post generation"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      blogPosts: z
        .array(BlogPostSchema)
        .optional()
        .describe("4 generated blog post suggestions"),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const {
        contextType,
        textContext,
        urlContext,
        jsonContext,
        additionalInstructions,
      } = context;

      try {
        const state = env.MESH_REQUEST_CONTEXT?.state;
        const n8nBlogWebhookUrl = state?.n8nBlogWebhookUrl ?? "";

        if (!n8nBlogWebhookUrl) {
          return {
            success: false,
            error: "n8n Blog Webhook URL not configured",
          };
        }

        // Validate context based on type
        let contextData: unknown;

        switch (contextType) {
          case "text":
            if (!textContext) {
              return {
                success: false,
                error: 'textContext is required when contextType is "text"',
              };
            }
            contextData = { type: "text", content: textContext };
            break;

          case "url":
            if (!urlContext) {
              return {
                success: false,
                error: 'urlContext is required when contextType is "url"',
              };
            }
            contextData = { type: "url", url: urlContext };
            break;

          case "json":
            if (!jsonContext) {
              return {
                success: false,
                error: 'jsonContext is required when contextType is "json"',
              };
            }
            contextData = { type: "json", data: jsonContext };
            break;

          default:
            return {
              success: false,
              error: `Invalid contextType: ${contextType}`,
            };
        }

        // Set up timeout controller (5 minutes)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000);

        try {
          const response = await fetch(n8nBlogWebhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              context: contextData,
              additionalInstructions: additionalInstructions ?? "",
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            return {
              success: false,
              error: `Webhook returned ${response.status}: ${response.statusText}`,
            };
          }

          const data = (await response.json()) as Record<string, unknown>;

          // Parse and validate response
          const blogPosts = Array.isArray(data.blogPosts)
            ? (data.blogPosts as Record<string, unknown>[])
            : Array.isArray(data)
              ? (data as Record<string, unknown>[])
              : [];

          return {
            success: true,
            blogPosts: blogPosts
              .slice(0, 4)
              .map((post: Record<string, unknown>) => ({
                title: String(post.title ?? ""),
                content: String(post.content ?? ""),
                summary: String(post.summary ?? ""),
              })),
          };
        } catch (fetchError) {
          clearTimeout(timeoutId);

          if (fetchError instanceof Error && fetchError.name === "AbortError") {
            return {
              success: false,
              error: "Workflow timeout - exceeded 5 minutes of execution",
            };
          }
          throw fetchError;
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  });

/**
 * Export all blog generator tools
 */
export const blogGeneratorTools = [generateBlogTool];
