/**
 * Tool: Recommend Model
 * Get AI model recommendations based on task requirements
 */

import { createPrivateTool } from "@decocms/runtime/tools";
import { getOpenRouterApiKey } from "server/lib/env.ts";
import { z } from "zod";
import { OpenRouterClient } from "../../lib/openrouter-client.ts";
import type { Env } from "../../main.ts";
import { recommendModelsForTask } from "./utils.ts";

export const createRecommendModelTool = (_env: Env) =>
  createPrivateTool({
    id: "RECOMMEND_MODEL",
    description:
      "Get intelligent model recommendations based on your task description and requirements. " +
      "The system analyzes your task (e.g., 'code generation', 'creative writing', 'data analysis') " +
      "and suggests the most suitable models considering cost, quality, context length, and capabilities. " +
      "Each recommendation includes detailed reasoning explaining why the model is suitable. " +
      "Perfect for discovering the right model when you're not sure which to use.",
    inputSchema: z.object({
      taskDescription: z
        .string()
        .describe(
          "Description of your task (e.g., 'generate Python code', 'write creative stories', 'analyze large documents', 'answer questions with images')",
        ),
      requirements: z
        .object({
          maxCostPer1MTokens: z
            .number()
            .positive()
            .optional()
            .describe(
              "Maximum budget per 1M tokens in dollars (e.g., 5 for $5)",
            ),
          minContextLength: z
            .number()
            .positive()
            .optional()
            .describe(
              "Minimum required context length in tokens (e.g., 100000 for 100k)",
            ),
          requiredModality: z
            .enum(["text->text", "text+image->text", "text->image"])
            .optional()
            .describe(
              "Required model capability: 'text->text' for text-only, 'text+image->text' for vision, 'text->image' for image generation",
            ),
          prioritize: z
            .enum(["cost", "quality", "speed"])
            .default("quality")
            .optional()
            .describe(
              "What to prioritize: 'cost' for cheapest models, 'quality' for best performance, 'speed' for fastest models",
            ),
        })
        .optional()
        .describe("Optional requirements and constraints for model selection"),
    }),
    outputSchema: z.object({
      recommendations: z
        .array(
          z.object({
            modelId: z
              .string()
              .describe("Model identifier to use for API calls"),
            name: z.string().describe("Human-readable model name"),
            reasoning: z
              .string()
              .describe(
                "Explanation of why this model is recommended for your task",
              ),
            score: z
              .number()
              .describe("Recommendation score (higher is better, 0-100 scale)"),
            pricing: z.object({
              promptPrice: z.string().describe("Cost per 1M prompt tokens"),
              completionPrice: z
                .string()
                .describe("Cost per 1M completion tokens"),
            }),
            contextLength: z
              .number()
              .describe("Maximum context length in tokens"),
            modality: z.string().describe("Model capability"),
          }),
        )
        .describe("Top recommended models ordered by score"),
    }),
    execute: async ({ context, runtimeContext }) => {
      const { taskDescription, requirements = {} } = context;
      const client = new OpenRouterClient({
        apiKey: getOpenRouterApiKey(runtimeContext),
      });

      // Fetch all available models
      const allModels = await client.listModels();

      // Get recommendations
      const recommendations = recommendModelsForTask(
        taskDescription,
        requirements,
        allModels,
      );

      return { recommendations };
    },
  });
