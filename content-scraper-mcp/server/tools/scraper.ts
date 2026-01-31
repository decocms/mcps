/**
 * Content scraping tool via n8n webhook.
 */
import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";

/**
 * Call the n8n webhook to scrape content from a URL.
 */
export const scrapeContentTool = (env: Env) =>
  createPrivateTool({
    id: "RUN_SCRAPING_WORKFLOW",
    description:
      "Runs the scraping workflow to collect content from configured sources (URLs, Reddit, LinkedIn, Twitter). " +
      "Processes content through an automated pipeline and saves it to the database.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.unknown().optional(),
      error: z.string().optional(),
    }),
    execute: async () => {
      try {
        const state = env.MESH_REQUEST_CONTEXT?.state;
        const n8nWebhookUrl = state?.n8nWebhookUrl ?? "";
        const urlEntries = state?.urlFields?.urls ?? [];
        const redditEntries = state?.redditFields?.RedditTopicsToScrape ?? [];
        const linkedinEntries = state?.linkedinFields?.linkedinProfiles ?? [];
        const twitterEntries = state?.twitterFields?.TwitterTopics ?? [];

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000);

        try {
          const response = await fetch(n8nWebhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              urls: urlEntries.map((entry) => ({
                url: entry.url,
                type: entry.type,
                authority: entry.authority,
              })),
              reddit_topics: redditEntries.map((entry) => ({
                topic: entry.topic,
                type: entry.type,
                authority: entry.authority,
              })),
              linkedin_topics: linkedinEntries.map((entry) => ({
                profile: entry.profile,
                type: entry.type,
                authority: entry.authority,
              })),
              twitter_topics: twitterEntries.map((entry) => ({
                topic: entry.topic,
                type: entry.type,
                authority: entry.authority,
              })),
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

          const data = await response.json();

          return {
            success: true,
            data,
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
 * Export all scraper tools
 */
export const scraperTools = [scrapeContentTool];
