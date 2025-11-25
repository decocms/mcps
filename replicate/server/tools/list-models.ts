/**
 * Tool: List Models
 * List available models from a Replicate user/organization
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import type { Env } from "../main";
import { ListModelsInputSchema, ListModelsOutputSchema } from "../lib/types";

export const createListModelsTool = (env: Env) =>
  createPrivateTool({
    id: "LIST_MODELS",
    description:
      "List available models from Replicate. " +
      "You can filter by owner (user or organization) to see their models. " +
      "Returns model metadata including name, description, run count, and latest version info.",
    inputSchema: ListModelsInputSchema,
    outputSchema: ListModelsOutputSchema,
    execute: async ({ context }) => {
      const { owner } = context;

      // Use the search API to list models by owner
      // The Replicate SDK doesn't expose a direct list-by-owner method
      const ownerName = owner || "replicate";

      // Fetch models using the REST API directly
      const apiKey = env.state.apiKey;
      const response = await fetch(
        `https://api.replicate.com/v1/models?owner=${ownerName}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        results: any[];
        next?: string;
      };

      // Transform response
      const models = data.results || [];

      return {
        models: models.map((model: any) => ({
          owner: model.owner,
          name: model.name,
          description: model.description,
          visibility: model.visibility,
          run_count: model.run_count || 0,
          cover_image_url: model.cover_image_url,
          url: model.url,
          latest_version: model.latest_version
            ? {
                id: model.latest_version.id,
                created_at: model.latest_version.created_at,
              }
            : undefined,
        })),
        next_cursor: data.next,
      };
    },
  });
