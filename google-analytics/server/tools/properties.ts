import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../types/env.ts";
import { GaClient } from "../lib/ga-client.ts";

export const getPropertyDetailsTool = (env: Env) =>
  createPrivateTool({
    id: "get-property-details",
    description: "Returns details about a property.",
    inputSchema: z.object({
      property: z
        .string()
        .describe(
          "The Google Analytics Property identifier e.g. 'properties/1234567'",
        ),
    }),
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);

      try {
        const response = await client.getProperty(args.property);

        return { response };
      } catch (error) {
        throw new Error(
          `Failed to retrieve property details: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });

export const getCustomDimensionsAndMetricsTool = (env: Env) =>
  createPrivateTool({
    id: "get-custom-dimensions-and-metrics",
    description:
      "Retrieves the custom dimensions and metrics for a specific property.",
    inputSchema: z.object({
      property: z
        .string()
        .describe(
          "The Google Analytics Property identifier e.g. 'properties/1234567'",
        ),
    }),
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);

      try {
        const dimensions = await client.listCustomDimensions(args.property);
        const metrics = await client.listCustomMetrics(args.property);

        return { dimensions, metrics };
      } catch (error) {
        throw new Error(
          `Failed to retrieve custom dimensions/metrics: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
