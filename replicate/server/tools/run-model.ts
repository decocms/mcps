/**
 * Tool: Run Model
 * Create and execute a prediction using a Replicate model
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import type { Env } from "../main";
import { createReplicateClient } from "../lib/replicate";
import {
  RunModelInputSchema,
  StrictPredictionStatusSchema,
  BasePredictionOutputSchema,
} from "../lib/types";

export const createRunModelTool = (env: Env) =>
  createPrivateTool({
    id: "RUN_MODEL",
    description:
      "Execute a prediction using a Replicate model. " +
      "Provide the model identifier (e.g., 'stability-ai/sdxl') and input parameters. " +
      "The tool will create a prediction and wait for it to complete. " +
      "Returns the prediction output, which varies by model (images, text, audio, etc.).",
    inputSchema: RunModelInputSchema,
    outputSchema: z.object({
      ...BasePredictionOutputSchema,
      status: StrictPredictionStatusSchema,
    }),
    execute: async ({ context }) => {
      const { model, input, wait = true, webhook } = context;

      const client = createReplicateClient(env);

      // Parse model string to get owner/name/version
      const modelParts = model.split(":");
      const modelId = modelParts[0];
      const version = modelParts[1];

      // Create prediction options
      const options: {
        input: Record<string, unknown>;
        version?: string;
        webhook?: string;
        webhook_completed?: string;
      } = {
        input,
      };

      if (version) {
        options.version = version;
      }

      if (webhook) {
        options.webhook = webhook;
        options.webhook_completed = webhook;
      }

      // Create and run prediction
      let prediction;

      if (wait) {
        // Wait for completion
        prediction = await client.run(modelId, options);
      } else {
        // Create prediction without waiting
        prediction = await client.predictions.create({
          model: modelId,
          ...options,
        });
      }

      return {
        id: prediction.id,
        status: prediction.status,
        model: prediction.model || model,
        output: prediction.output,
        error: prediction.error ? String(prediction.error) : undefined,
        logs: prediction.logs,
        metrics: prediction.metrics,
        urls: prediction.urls,
      };
    },
  });
