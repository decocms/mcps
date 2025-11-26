/**
 * Tool: Run Model
 * Create and execute a prediction using a Replicate model
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import { z } from "zod";
import type { Prediction } from "replicate";
import type { Env } from "../main";
import { createReplicateClient } from "../lib/replicate";
import {
  RunModelInputSchema,
  PredictionStatusSchema,
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
      status: PredictionStatusSchema,
    }),
    execute: async ({ context }) => {
      const { model, input, wait = true, webhook } = context;

      const client = createReplicateClient(env);

      const modelParts = model.split(":");
      const modelId = modelParts[0];
      const version = modelParts[1];

      // Validate model format: must be "owner/name" or "owner/name:version"
      if (!isValidModelIdentifier(modelId)) {
        throw new Error(
          `Invalid model format: "${model}". Expected format: "owner/name" or "owner/name:version"`,
        );
      }

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
      let prediction: Prediction;

      if (wait) {
        prediction = (await client.run(modelId, options)) as Prediction;
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

function isValidModelIdentifier(
  modelId: string,
): modelId is `${string}/${string}` {
  const parts = modelId.split("/");
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
}
