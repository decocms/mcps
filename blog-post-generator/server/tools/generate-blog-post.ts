/**
 * Blog Post Generator Tool
 *
 * Tool to generate blog posts from context and tone of voice using n8n webhook.
 */

import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";

/**
 * Blog post schema
 */
const BlogPostSchema = z.object({
  title: z.string().describe("Blog post title"),
  content: z.string().describe("Full blog post content"),
  summary: z.string().describe("Blog post summary"),
});

/**
 * Generate blog post tool - generates blog posts from context and tone of voice
 */
export const generateBlogPostTool = (env: Env) =>
  createPrivateTool({
    id: "generate_blog_post",
    description:
      "Generate blog post suggestions from context and tone of voice. " +
      "Accepts either plain text OR JSON for both context and tone of voice. " +
      "Returns 4 blog post suggestions with title, content, and summary.",
    inputSchema: z.object({
      contextText: z
        .string()
        .optional()
        .describe(
          "Plain text context for blog post generation. Use this OR contextJson, not both.",
        ),
      contextJson: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "JSON context for blog post generation (e.g., from content-scraper). Use this OR contextText, not both.",
        ),
      toneOfVoiceText: z
        .string()
        .optional()
        .describe(
          "Plain text describing the desired tone of voice. Use this OR toneOfVoiceJson, not both.",
        ),
      toneOfVoiceJson: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "JSON describing the desired tone of voice with structured attributes. Use this OR toneOfVoiceText, not both.",
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
        contextText,
        contextJson,
        toneOfVoiceText,
        toneOfVoiceJson,
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

        // Validate that at least one context is provided
        if (!contextText && !contextJson) {
          return {
            success: false,
            error: "Either contextText or contextJson must be provided",
          };
        }

        // Validate that only one context type is provided
        if (contextText && contextJson) {
          return {
            success: false,
            error: "Provide either contextText OR contextJson, not both",
          };
        }

        // Validate that only one tone of voice type is provided (if any)
        if (toneOfVoiceText && toneOfVoiceJson) {
          return {
            success: false,
            error:
              "Provide either toneOfVoiceText OR toneOfVoiceJson, not both",
          };
        }

        // Build context data
        const contextData = contextText
          ? { type: "text", content: contextText }
          : { type: "json", data: contextJson };

        // Build tone of voice data (optional)
        const toneOfVoiceData = toneOfVoiceText
          ? { type: "text", content: toneOfVoiceText }
          : toneOfVoiceJson
            ? { type: "json", data: toneOfVoiceJson }
            : null;

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
              toneOfVoice: toneOfVoiceData,
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
 * Export all blog post generator tools
 */
export const blogPostGeneratorTools = [generateBlogPostTool];
