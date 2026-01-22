/**
 * Blog Post Generator Tool
 *
 * Tool to generate blog posts from context and tone of voice using n8n webhook.
 */

import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";

/**
 * Blog post recommendation schema (matches n8n webhook response)
 */
const BlogPostRecommendationSchema = z.object({
  option_id: z.number().optional().describe("Recommendation option ID"),
  title: z.string().describe("Blog post title"),
  subtitle: z.string().optional().describe("Blog post subtitle"),
  content_type: z.string().optional().describe("Type of content"),
  estimated_word_count: z.number().optional().describe("Estimated word count"),
  core_angle: z.string().optional().describe("Core strategic angle"),
  problem_addressed: z
    .string()
    .optional()
    .describe("Problem the post addresses"),
  why_it_differs: z
    .string()
    .optional()
    .describe("Why this differs from existing content"),
  primary_audience: z.string().optional().describe("Primary target audience"),
  why_now: z.string().optional().describe("Why this topic is timely"),
  key_sections: z
    .array(
      z.object({
        section_title: z.string(),
        section_goal: z.string(),
      }),
    )
    .optional()
    .describe("Key sections of the article"),
  primary_keywords: z
    .array(z.string())
    .optional()
    .describe("Primary SEO keywords"),
  secondary_keywords: z
    .array(z.string())
    .optional()
    .describe("Secondary SEO keywords"),
  suggested_channels: z
    .array(z.string())
    .optional()
    .describe("Suggested distribution channels"),
  engagement_potential: z
    .string()
    .optional()
    .describe("Engagement potential rating"),
  engagement_reasoning: z
    .string()
    .optional()
    .describe("Reasoning for engagement potential"),
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
      content_porpuse: z
        .string()
        .optional()
        .describe("Content purpose for blog post generation"),
      brand_context: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Brand context as JSON for blog post generation"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      recommendations: z
        .array(BlogPostRecommendationSchema)
        .optional()
        .describe("Generated blog post recommendations"),
      analysis_context: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Analysis context from the webhook"),
      recommendation_rationale: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Rationale for recommendations"),
      raw_response: z
        .unknown()
        .optional()
        .describe("Raw response from webhook for additional details"),
      error: z.string().optional(),
    }),
    execute: async ({ context }) => {
      const {
        contextText,
        contextJson,
        toneOfVoiceText,
        toneOfVoiceJson,
        additionalInstructions,
        content_porpuse,
        brand_context,
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
              content_porpuse: content_porpuse ?? "",
              brand_context: brand_context ?? null,
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

          const data = (await response.json()) as unknown;
          const dataObj = data as Record<string, unknown> | unknown[];

          // Parse response - handle multiple possible structures from n8n webhook
          let output: Record<string, unknown> | null = null;

          // Structure 1: Array with output object (e.g., [{ output: { ... } }])
          if (Array.isArray(dataObj) && dataObj.length > 0) {
            const firstItem = dataObj[0] as Record<string, unknown> | undefined;
            if (firstItem?.output) {
              output = firstItem.output as Record<string, unknown>;
            }
          }
          // Structure 2: Direct output object (e.g., { output: { ... } })
          else if (!Array.isArray(dataObj) && dataObj?.output) {
            output = dataObj.output as Record<string, unknown>;
          }
          // Structure 3: Direct data with article_recommendations
          else if (
            !Array.isArray(dataObj) &&
            dataObj?.article_recommendations
          ) {
            output = dataObj as Record<string, unknown>;
          }
          // Structure 4: Legacy format with blogPosts
          else if (!Array.isArray(dataObj) && dataObj?.blogPosts) {
            const legacyPosts = Array.isArray(dataObj.blogPosts)
              ? (dataObj.blogPosts as Record<string, unknown>[])
              : [];

            return {
              success: true,
              recommendations: legacyPosts
                .slice(0, 4)
                .map((post: Record<string, unknown>) => ({
                  title: String(post.title ?? ""),
                  subtitle: String(post.subtitle ?? post.summary ?? ""),
                  content_type: String(post.content_type ?? ""),
                  core_angle: String(post.content ?? post.core_angle ?? ""),
                })),
              raw_response: data,
            };
          }

          // If we have parsed output with article_recommendations
          if (output?.article_recommendations) {
            const recommendations = output.article_recommendations as Record<
              string,
              unknown
            >[];

            return {
              success: true,
              recommendations: recommendations.map(
                (rec: Record<string, unknown>) => {
                  const editorial = rec.editorial_identity as
                    | Record<string, unknown>
                    | undefined;
                  const strategic = rec.strategic_angle as
                    | Record<string, unknown>
                    | undefined;
                  const audience = rec.audience_fit as
                    | Record<string, unknown>
                    | undefined;
                  const timeliness = rec.timeliness as
                    | Record<string, unknown>
                    | undefined;
                  const structure = rec.content_structure as
                    | Record<string, unknown>
                    | undefined;
                  const distribution = rec.distribution_and_growth as
                    | Record<string, unknown>
                    | undefined;
                  const seo = rec.seo_and_discoverability as
                    | Record<string, unknown>
                    | undefined;

                  return {
                    option_id: rec.option_id as number | undefined,
                    title: String(editorial?.title ?? rec.title ?? ""),
                    subtitle: String(editorial?.subtitle ?? ""),
                    content_type: String(editorial?.content_type ?? ""),
                    estimated_word_count: editorial?.estimated_word_count as
                      | number
                      | undefined,
                    core_angle: String(strategic?.core_angle ?? ""),
                    problem_addressed: String(
                      strategic?.problem_addressed ?? "",
                    ),
                    why_it_differs: String(strategic?.why_it_differs ?? ""),
                    primary_audience: String(audience?.primary_audience ?? ""),
                    why_now: String(timeliness?.why_now ?? ""),
                    key_sections: Array.isArray(structure?.key_sections)
                      ? (structure.key_sections as Array<{
                          section_title: string;
                          section_goal: string;
                        }>)
                      : undefined,
                    primary_keywords: Array.isArray(seo?.primary_keywords)
                      ? (seo.primary_keywords as string[])
                      : undefined,
                    secondary_keywords: Array.isArray(seo?.secondary_keywords)
                      ? (seo.secondary_keywords as string[])
                      : undefined,
                    suggested_channels: Array.isArray(
                      distribution?.suggested_channels,
                    )
                      ? (distribution.suggested_channels as string[])
                      : undefined,
                    engagement_potential: String(
                      distribution?.engagement_potential ?? "",
                    ),
                    engagement_reasoning: String(
                      distribution?.engagement_reasoning ?? "",
                    ),
                  };
                },
              ),
              analysis_context: output.analysis_context as
                | Record<string, unknown>
                | undefined,
              recommendation_rationale: output.recommendation_rationale as
                | Record<string, unknown>
                | undefined,
              raw_response: data,
            };
          }

          // Fallback: return raw response if structure is unrecognized
          return {
            success: true,
            raw_response: data,
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
