/**
 * Tool: Cancel Prediction
 * Cancel a running prediction
 */

import { createTool, ensureAuthenticated } from "@decocms/runtime/tools";
import type { Env } from "../main";
import { createReplicateClient } from "../lib/replicate";
import {
  CancelPredictionInputSchema,
  CancelPredictionOutputSchema,
} from "../lib/types";

export const createCancelPredictionTool = (env: Env) =>
  createTool({
    id: "CANCEL_PREDICTION",
    description:
      "Cancel a prediction that is currently starting or processing. " +
      "Once canceled, the prediction cannot be resumed. " +
      "Returns the updated prediction status.",
    inputSchema: CancelPredictionInputSchema,
    outputSchema: CancelPredictionOutputSchema,
    execute: async ({ context }, ctx) => {
      ensureAuthenticated(ctx!);
      const { predictionId } = context;

      const client = createReplicateClient(env);

      // Cancel the prediction
      const prediction = await client.predictions.cancel(predictionId);

      return {
        id: prediction.id,
        status: prediction.status,
        message: `Prediction ${predictionId} has been canceled`,
      };
    },
  });
