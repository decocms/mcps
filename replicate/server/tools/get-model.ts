/**
 * Tool: Get Model
 * Get detailed information about a specific Replicate model
 */

import { createPrivateTool } from "@decocms/runtime/mastra";
import type { Env } from "../main";
import { createReplicateClient } from "../lib/replicate";
import { GetModelInputSchema, CompleteModelDetailsSchema } from "../lib/types";

export const createGetModelTool = (env: Env) =>
  createPrivateTool({
    id: "GET_MODEL",
    description:
      "Get detailed information about a specific Replicate model. " +
      "Returns comprehensive metadata including description, run count, " +
      "example inputs/outputs, latest version details, and schema information.",
    inputSchema: GetModelInputSchema,
    outputSchema: CompleteModelDetailsSchema,
    execute: async ({ context }) => {
      const { model } = context;

      // Parse owner/name from model string
      const [owner, name] = model.split("/");

      if (!owner || !name) {
        throw new Error(
          "Invalid model format. Use 'owner/name' format (e.g., 'stability-ai/sdxl')",
        );
      }

      const client = createReplicateClient(env);

      // Get model details
      const modelData = await client.models.get(owner, name);

      return {
        owner: modelData.owner,
        name: modelData.name,
        description: modelData.description,
        visibility: modelData.visibility,
        run_count: modelData.run_count || 0,
        cover_image_url: modelData.cover_image_url,
        url: modelData.url,
        github_url: modelData.github_url,
        paper_url: modelData.paper_url,
        license_url: modelData.license_url,
        latest_version: modelData.latest_version
          ? {
              id: modelData.latest_version.id,
              created_at: modelData.latest_version.created_at,
              cog_version: modelData.latest_version.cog_version || "",
              openapi_schema: (modelData.latest_version.openapi_schema ||
                {}) as Record<string, unknown>,
            }
          : undefined,
        default_example: modelData.default_example
          ? {
              input: (modelData.default_example.input || {}) as Record<
                string,
                unknown
              >,
              output: modelData.default_example.output,
            }
          : undefined,
      };
    },
  });
