/**
 * Tool: Compare Models
 * Compare multiple models side-by-side to help choose the best one
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { getOpenRouterApiKey } from "../../lib/env.ts";
import { z } from "zod";
import { OpenRouterClient } from "../../lib/openrouter-client.ts";
import type { Env } from "../../main.ts";
import { compareModels } from "./utils.ts";

export const createCompareModelsTool = (env: Env) =>
  createPrivateTool({
    id: "COMPARE_MODELS",
    description:
      "Compare multiple OpenRouter models side-by-side to help choose the best model for a specific use case. " +
      "Compares pricing (prompt and completion costs), context length, capabilities (modality), and performance " +
      "characteristics. Returns a detailed comparison table and an automatic recommendation. " +
      "Useful when deciding between multiple models for a task.",
    inputSchema: z.object({
      modelIds: z
        .array(z.string())
        .min(2)
        .max(5)
        .describe(
          "Array of 2-5 model IDs to compare (e.g., ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-exp'])",
        ),
      criteria: z
        .array(z.enum(["price", "context_length", "modality", "moderation"]))
        .optional()
        .describe(
          "Specific criteria to focus on in comparison. If not specified, all criteria are included.",
        ),
    }),
    outputSchema: z.object({
      comparison: z.array(
        z.object({
          modelId: z.string(),
          name: z.string(),
          metrics: z
            .record(z.string(), z.any())
            .describe("Model metrics based on selected criteria"),
        }),
      ),
      recommendation: z
        .string()
        .optional()
        .describe("Automated recommendation based on comparison"),
    }),
    execute: async ({ context }) => {
      const { modelIds, criteria } = context;
      const client = new OpenRouterClient({
        apiKey: getOpenRouterApiKey(env),
      });

      // Fetch all models
      const allModels = await client.listModels();

      // Compare the models
      const result = compareModels(modelIds, allModels, criteria);

      return result;
    },
  });
