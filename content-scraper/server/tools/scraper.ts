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
    id: "scrape_content",
    description:
      "Scrape content from a URL using the n8n workflow. " +
      "Extracts and processes web content through an automated pipeline.",
    inputSchema: z.object({
      url: z.string().url().describe("The URL to scrape content from"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      data: z.unknown().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ context: input }) => {
      try {
        const n8nWebhookUrl =
          env.MESH_REQUEST_CONTEXT?.state?.n8nWebhookUrl ?? "";
        const url = new URL(n8nWebhookUrl);
        url.searchParams.set("url", input.url);

        const response = await fetch(url.toString());

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
