import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../../shared/deco.gen.ts";
import { GaClient } from "../lib/ga-client.ts";
import {
  PropertySchema,
  CustomDimensionsAndMetricsOutputSchema,
} from "../lib/schemas.ts";

const propertySchema = z
  .string()
  .describe(
    "GA4 Property identifier — 'properties/1234567' or just '1234567'.",
  );

export const getPropertyDetailsTool = (env: Env) =>
  createPrivateTool({
    id: "get-property-details",
    description:
      "Returns metadata and configuration details about a GA4 property.",
    inputSchema: z.object({ property: propertySchema }),
    outputSchema: PropertySchema,
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);
      try {
        const result = await client.getProperty(args.property);
        return PropertySchema.parse(result);
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
      "Retrieves the custom dimensions and custom metrics configured for a GA4 property.",
    inputSchema: z.object({ property: propertySchema }),
    outputSchema: CustomDimensionsAndMetricsOutputSchema,
    execute: async ({ context: args }) => {
      const client = GaClient.fromEnv(env);
      try {
        const [dimensionsResult, metricsResult] = await Promise.all([
          client.listCustomDimensions(args.property),
          client.listCustomMetrics(args.property),
        ]);
        return CustomDimensionsAndMetricsOutputSchema.parse({
          ...(dimensionsResult as object),
          ...(metricsResult as object),
        });
      } catch (error) {
        throw new Error(
          `Failed to retrieve custom dimensions/metrics: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
