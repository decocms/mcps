/**
 * Tool: Get Prediction
 * Retrieve the status and results of a prediction by ID
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import type { Env } from "../main";
import { createReplicateClient } from "../lib/replicate";
import {
  GetPredictionInputSchema,
  CompletePredictionOutputSchema,
} from "../lib/types";

export const createGetPredictionTool = (env: Env) =>
  createPrivateTool({
    id: "GET_PREDICTION",
    description:
      "Get the current status and results of a prediction by its ID. " +
      "Use this to check on predictions created with wait=false, " +
      "or to retrieve results after receiving a webhook notification.",
    inputSchema: GetPredictionInputSchema,
    outputSchema: z.object(CompletePredictionOutputSchema),
    execute: async ({ context }) => {
      const { predictionId } = context;

      const client = createReplicateClient(env);

      // Get prediction status
      const prediction = await client.predictions.get(predictionId);

      return {
        id: prediction.id,
        status: prediction.status,
        model: prediction.model || "",
        version: prediction.version || "",
        input: (prediction.input || {}) as Record<string, unknown>,
        output: prediction.output,
        error: prediction.error ? String(prediction.error) : undefined,
        logs: prediction.logs,
        metrics: prediction.metrics,
        created_at: prediction.created_at || "",
        started_at: prediction.started_at,
        completed_at: prediction.completed_at,
        urls: prediction.urls,
      };
    },
  });
