import { z } from "zod";
import { createPrivateTool } from "@decocms/runtime/tools";
import type { Env } from "../../shared/deco.gen.ts";
import { GaClient } from "../lib/ga-client.ts";
import { resolveProperty } from "../lib/env.ts";
import {
  PropertySchema,
  CustomDimensionsAndMetricsOutputSchema,
} from "../lib/schemas.ts";

const propertySchema = z
  .string()
  .optional()
  .describe(
    "GA4 Property identifier — 'properties/1234567' or just '1234567'. Falls back to the default propertyId configured for this integration when omitted.",
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
        const result = await client.getProperty(
          resolveProperty(env, args.property),
        );
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
        const property = resolveProperty(env, args.property);
        // Both calls are independent — run in parallel to halve latency.
        const [dimensionsResult, metricsResult] = await Promise.all([
          client.listCustomDimensions(property),
          client.listCustomMetrics(property),
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
